import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreateSession, getUserCumulativeScore, getQuizForQuestion, resolveSessionToQuizId, getExistingAnswer } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { DEFAULT_CHOICE_METADATA } from '@/lib/analytics/hcp';
import type { Choice } from '@/lib/types';

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
});

// Strip answer-key and profiling fields from player-facing question payloads.
// Choice outcomes are returned only after a player answers via POST.
function sanitizeQuestion(question: Record<string, unknown> | null) {
  if (!question) return question;
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
        const rest = { ...(choice as Record<string, unknown>) };
        delete rest.score_impact;
        delete rest.points;
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

    const fromQuestionId = searchParams.get('fromQuestionId');
    const choiceLabel = searchParams.get('choiceLabel');
    if (fromQuestionId && choiceLabel) {
      const next = await getNextQuestion(fromQuestionId, choiceLabel);
      if (!next) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(next));
    }

    const questionId = searchParams.get('questionId');
    if (questionId) {
      // Authorize: the question's parent quiz must be published, or the
      // caller must own/admin it. Prevents enumeration of draft quizzes.
      const access = await getQuizForQuestion(questionId);
      if (!access) return NextResponse.json(null, { status: 404 });
      if (!access.is_published && !user.isAdmin && access.created_by !== user.uid) {
        return NextResponse.json(null, { status: 404 });
      }
      const question = await getQuestionById(questionId);
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

    if (raw?.action === 'start') {
      const parsed = StartBody.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      if (parsed.data.is_guest) return NextResponse.json({ is_guest: true });
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const playSession = await getOrCreateSession(sessionId, user.uid);
      return NextResponse.json(playSession);
    }

    const parsed = AnswerBody.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const user = await getSessionUser();

    // An authenticated caller is ALWAYS routed through the non-guest path so
    // the one-answer-per-(session,user,question) guard applies. Otherwise a
    // logged-in player could set is_guest:true to probe every label, learn
    // score_impact, then resubmit the best label non-guest for a perfect score.
    if (parsed.data.is_guest && !user) {
      const access = await getQuizForQuestion(parsed.data.question_id);
      if (!access || !access.is_published) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const sessionQuizId = await resolveSessionToQuizId(sessionId);
      if (!sessionQuizId || sessionQuizId !== access.quiz_id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const question = await getQuestionById(parsed.data.question_id);
      const selectedChoice = question?.choices?.find(
        (choice: Choice) => choice.label === parsed.data.chosen_label,
      );
      return NextResponse.json({
        is_guest: true,
        points_earned: selectedChoice?.score_impact ?? 0,
        explanation: selectedChoice?.explanation ?? null,
        behavior_meaning: selectedChoice?.behavior_meaning ?? null,
        allowed_usage: selectedChoice?.allowed_usage ?? DEFAULT_CHOICE_METADATA.allowed_usage,
      });
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Authorize: the question must belong to the same quiz this play session
    // is for. Without this, an authenticated user could inject answers from
    // unrelated (or draft) quizzes into their session_id row and inflate
    // their leaderboard score.
    const access = await getQuizForQuestion(parsed.data.question_id);
    if (!access) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const sessionQuizId = await resolveSessionToQuizId(sessionId);
    if (!sessionQuizId || sessionQuizId !== access.quiz_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // One answer per (session, user, question). The leaderboard aggregator
    // takes the LATEST row per question, so without this guard a player can
    // probe every label, observe points_earned, and resubmit the best label
    // last to walk away with a perfect score.
    const existing = await getExistingAnswer(sessionId, user.uid, parsed.data.question_id);
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

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
        await adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
          score: cumScore,
          displayName: 'Player',
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
