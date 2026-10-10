import { LobbyAccessError, withLobbyPlayerLock, requestConnectionId } from '@/lib/play/lobby-access';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { completeSession, getLeaderboard, getAttemptBoundary, getExistingAnswer, getUserHistory, getUserHistoryAnswers, getNextQuestion, getQuestionById, getQuizForQuestion, resolveSessionToQuizId } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { verifyQuestionToken } from '@/lib/security/question-token';
import { getPlayUser } from '@/lib/play-auth';
import { completeProgress, getProgress } from '@/lib/db/play-progress';
import { finishLobbyScore } from '@/lib/play/lobby-progress';

import { preparePersonalRecap } from '@/lib/ai/personal-recap';
import type { UserHistoryRow } from '@/lib/analytics/history';
import type { PreparedInsight } from '@/lib/ai/auto-provisional-insight';
import { withDbSavepoint } from '@/lib/db/query-context';

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
    const playUser = await getPlayUser(request);
    if (playUser?.isGuest) {
      const progress = await getProgress(sessionId, playUser.uid);
      if (!progress || progress.question_id !== body.data.final_question_id ||
        !verifyQuestionToken(body.data.final_question_token, sessionId, playUser.uid, progress.question_id, 'guest')) return NextResponse.json({ error: 'Invalid progress' }, { status: 403 });
      const question = await getQuestionById(progress.question_id);
      const label = question?.node_type === 'situation' ? 'continue' : progress.answer?.chosen_label;
      if (!question || (question.node_type !== 'end' && (!label || await getNextQuestion(question.id, label)))) return NextResponse.json({ error: 'Quiz is not complete' }, { status: 403 });
      await completeProgress(sessionId, playUser.uid);
      return NextResponse.json({ is_guest: true, total_score: progress.score, total_time_ms: Date.now() - Number(progress.started_at) });
    }

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let prepared: PreparedInsight = { state: 'unavailable' };
    const result = await withLobbyPlayerLock(request, sessionId, user.uid, async () => {
      const boundary = await getAttemptBoundary(sessionId, user.uid);
      if (!verifyQuestionToken(body.data.final_question_token, sessionId, user.uid, body.data.final_question_id, boundary)) return null;
      const checkpoint = await getProgress(sessionId,user.uid);
      if (checkpoint?.completed) {
        const saved = (await getLeaderboard(sessionId,user.uid)).find(entry => entry.is_me);
        // A retry after a failed RTDB write must still mark the lobby row finished.
        if (saved) await adminRtdb.ref(`sessions/${sessionId}`).transaction(room =>
          finishLobbyScore(room, user.uid, Number(saved.total_score), requestConnectionId(request)));
        return saved ? {total_score:saved.total_score,streak:saved.streak,total_time_ms:saved.total_time_ms} : null;
      }
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
      await completeProgress(sessionId, user.uid);
      // Persist the shared generation claim before returning completion. Capture
      // the exact finished attempt while the player's answer lock is still held.
      try {
        prepared = await withDbSavepoint(async () => {
          const rows = await getUserHistory(user.uid) as UserHistoryRow[];
          const session = rows.find((row) => row.session_id === sessionId);
          if (!session) return { state: 'unavailable' } as PreparedInsight;
          const answers = await getUserHistoryAnswers(user.uid, sessionId, session.completed_at);
          return preparePersonalRecap(user.uid, session, answers, body.data.locale);
        });
      } catch (error) {
        console.error('completion recap preparation failed:', error instanceof Error ? error.message : 'unknown error');
      }
      await adminRtdb.ref(`sessions/${sessionId}`).transaction(room =>
        finishLobbyScore(room, user.uid, completed.total_score, requestConnectionId(request)));
      await adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`).transaction(current =>
        !current ? current : current.connectionId === requestConnectionId(request) ? null : undefined);
      return completed;
    });
    if (!result) return NextResponse.json({ error: 'Quiz is not complete' }, { status: 403 });

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
    if (err instanceof LobbyAccessError) return err.response;
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
