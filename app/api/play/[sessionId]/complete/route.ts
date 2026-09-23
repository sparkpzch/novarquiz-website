import { NextResponse } from 'next/server';
import { z } from 'zod';
import { completeSession, getAttemptBoundary, getExistingAnswer, getNextQuestion, getQuestionById, getQuizForQuestion, resolveSessionToQuizId, withPlayerAnswerLock } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { hasProfilingConsent } from '@/lib/analytics/consent';
import { verifyQuestionToken } from '@/lib/security/question-token';

const CompletionBody = z.object({
  is_guest: z.boolean().optional(),
  final_question_id: z.string().uuid(),
  final_question_token: z.string(),
  final_choice_label: z.string().min(1).max(10).optional(),
  user_display_name: z.string().nullable().optional(),
  user_photo_url: z.string().nullable().optional(),
});

const TRUSTED_PHOTO_ORIGINS = new Set([
  'lh3.googleusercontent.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Anonymous';
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 100) || 'Anonymous';
}

function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const { hostname } = new URL(raw);
    return TRUSTED_PHOTO_ORIGINS.has(hostname) ? raw : null;
  } catch {
    return null;
  }
}

// Called by the play page when the player reaches the end of their path
// (or runs out of time on the last question). Aggregates user_answers into
// leaderboard_entries and marks sessions.finished_at.
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = CompletionBody.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    if (body.data.is_guest) return NextResponse.json({ is_guest: true });

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await withPlayerAnswerLock(sessionId, user.uid, async () => {
      const boundary = await getAttemptBoundary(sessionId, user.uid);
      if (!verifyQuestionToken(body.data.final_question_token, sessionId, user.uid, body.data.final_question_id, boundary)) return null;
      const [question, access, quizId] = await Promise.all([
        getQuestionById(body.data.final_question_id),
        getQuizForQuestion(body.data.final_question_id),
        resolveSessionToQuizId(sessionId),
      ]);
      if (!question || !access || access.quiz_id !== quizId) return null;

      if (question.node_type !== 'end') {
        const label = question.node_type === 'situation' ? 'continue' : body.data.final_choice_label;
        if (!label) return null;
        if (question.node_type !== 'situation') {
          const answer = await getExistingAnswer(sessionId, user.uid, question.id);
          if (!answer || answer.chosen_label !== label) return null;
        }
        if (await getNextQuestion(question.id, label)) return null;
      }

      return completeSession({
        session_id: sessionId,
        user_id: user.uid,
        user_display_name: sanitizeDisplayName(body.data.user_display_name),
        user_photo_url: sanitizePhotoUrl(body.data.user_photo_url),
        profiling_consent: await hasProfilingConsent(user.uid),
      });
    });
    if (!result) return NextResponse.json({ error: 'Quiz is not complete' }, { status: 403 });

    void adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
      finished: true,
      currentQuestionId: null,
      updatedAt: Date.now(),
    }).catch(() => {});

    // HCP profiling fields are admin-only (admin analytics route); return scores only.
    return NextResponse.json({
      total_score: result.total_score,
      streak: result.streak,
      total_time_ms: result.total_time_ms,
    });
  } catch (err) {
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
