import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreateSession, getUserCumulativeScore, getSessionById } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { sanitizeDisplayName } from '@/lib/security';

const StartBody = z.object({
  action: z.literal('start'),
  is_guest: z.boolean().optional(),
  display_name: z.string().max(100).optional(),
  photo_url: z.string().url().max(500).optional().nullable(),
});
const AnswerBody = z.object({
  question_id: z.string().uuid(),
  chosen_label: z.string().min(1).max(10),
  time_taken_ms: z.number().int().min(0).max(300_000),
  is_guest: z.boolean().optional(),
  display_name: z.string().max(100).optional(),
  photo_url: z.string().url().max(500).optional().nullable(),
});

// Strip score_impact and explanation from choices so the answer key is never
// exposed to clients. The server computes scores in saveUserAnswer using the
// DB value; clients never need to see score_impact.
function sanitizeQuestion(question: Record<string, unknown> | null) {
  if (!question) return question;
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
        const rest = { ...(choice as Record<string, unknown>) };
        delete rest.score_impact;
        delete rest.explanation;
        delete rest.behavior_meaning;
        delete rest.vector_deltas;
        delete rest.clinical_tags;
        delete rest.confidence_weight;
        delete rest.allowed_usage;
        delete rest.requires_hcp_version;
        delete rest.review_status;
        return rest;
      })
    : question.choices;
  const restQuestion = { ...question };
  delete restQuestion.intended_audience;
  delete restQuestion.presentation_mode;
  delete restQuestion.reading_level;
  delete restQuestion.jurisdiction_tags;
  delete restQuestion.medical_review_version;
  delete restQuestion.legal_document_versions_required;
  return { ...restQuestion, choices };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const searchParams = request.nextUrl.searchParams;

  try {
    if (searchParams.get('entry') === 'true') {
      const question = await getEntryQuestion(sessionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(question));
    }

    // Resolve the quiz ID so question lookups are scoped to this session's quiz.
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const quizId: string = session.session_id;

    const fromQuestionId = searchParams.get('fromQuestionId');
    const choiceLabel = searchParams.get('choiceLabel');
    if (fromQuestionId && choiceLabel) {
      const next = await getNextQuestion(fromQuestionId, choiceLabel, quizId);
      if (!next) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(next));
    }

    const questionId = searchParams.get('questionId');
    if (questionId) {
      const question = await getQuestionById(questionId, quizId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(question));
    }

    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const raw = await request.json();

    // Always authenticate first. The previous order checked `is_guest` before
    // auth, which (a) created a public branch in an otherwise authenticated
    // route — a reviewer footgun — and (b) meant any side-effect added above
    // the auth check in future would inherit the bypass. Guest play, if
    // re-introduced, should live in a dedicated endpoint.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (raw?.action === 'start') {
      const parsed = StartBody.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      const playSession = await getOrCreateSession(sessionId, user.uid);
      return NextResponse.json(playSession);
    }

    const parsed = AnswerBody.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const result = await saveUserAnswer({
      session_id: sessionId,
      user_id: user.uid,
      question_id: parsed.data.question_id,
      chosen_label: parsed.data.chosen_label,
      time_taken_ms: parsed.data.time_taken_ms,
    });

    // Fire-and-forget: server writes authoritative score to RTDB so clients
    // cannot spoof the live leaderboard by writing arbitrary values directly.
    void (async () => {
      try {
        const cumScore = await getUserCumulativeScore(sessionId, user.uid);
        const displayName = sanitizeDisplayName(parsed.data.display_name);
        await adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
          score: cumScore,
          displayName,
          currentQuestionId: parsed.data.question_id,
          currentQuestionLabel: '',
          updatedAt: Date.now(),
        });
      } catch { /* non-fatal — live leaderboard degrades gracefully */ }
    })();

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
