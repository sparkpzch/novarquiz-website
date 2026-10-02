import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { completeSession, getAttemptBoundary, getExistingAnswer, getUserHistory, getUserHistoryAnswers, getNextQuestion, getQuestionById, getQuizForQuestion, resolveSessionToQuizId, withPlayerAnswerLock } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { verifyQuestionToken } from '@/lib/security/question-token';

import { preparePersonalRecap } from '@/lib/ai/personal-recap';
import type { UserHistoryRow } from '@/lib/analytics/history';
import type { PreparedInsight } from '@/lib/ai/auto-provisional-insight';

export const maxDuration = 60;

const CompletionBody = z.object({
  is_guest: z.boolean().optional(),
  locale: z.enum(['en', 'th']).default('en'),
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

    let prepared: PreparedInsight = { state: 'unavailable' };
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

      const completed = await completeSession({
        session_id: sessionId,
        user_id: user.uid,
        user_display_name: sanitizeDisplayName(body.data.user_display_name),
        user_photo_url: sanitizePhotoUrl(body.data.user_photo_url),
      });
      // Persist the shared generation claim before returning completion. Capture
      // the exact finished attempt while the player's answer lock is still held.
      try {
        const rows = await getUserHistory(user.uid) as UserHistoryRow[];
        const session = rows.find((row) => row.session_id === sessionId);
        if (session) {
          const answers = await getUserHistoryAnswers(user.uid, sessionId, session.completed_at);
          prepared = await preparePersonalRecap(user.uid, session, answers, body.data.locale);
        }
      } catch (error) {
        console.error('completion recap preparation failed:', error instanceof Error ? error.message : 'unknown error');
      }
      return completed;
    });
    if (!result) return NextResponse.json({ error: 'Quiz is not complete' }, { status: 403 });

    void adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
      finished: true,
      currentQuestionId: null,
      updatedAt: Date.now(),
    }).catch(() => {});

    // Gemini runs after the response; matching players reuse this persisted
    // lease. Its completed text appears in Insight Summaries without a click.
    const generate = prepared.generate;
    if (generate) after(async () => { await generate(); });

    // Return only the score summary required by the player client.
    return NextResponse.json({
      total_score: result.total_score,
      streak: result.streak,
      total_time_ms: result.total_time_ms,
      insight_state: prepared.state,
    });
  } catch (err) {
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
