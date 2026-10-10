import type { PlayerScore } from '@/lib/firebase/rtdb';

type LiveRoom = {
  hostId?: string;
  status?: string;
  roundId?: string;
  players?: Record<string, { connectionId?: string; left?: boolean; roundId?: string } | undefined>;
  scores?: Record<string, Partial<PlayerScore> | undefined>;
} | null;

// RTDB transaction body that marks a player finished on the live leaderboard.
// Shared by the first completion and its idempotent retry, so a retry after a
// failed RTDB write still flips the lobby row to "Finished".
export function finishLobbyScore(room: LiveRoom, uid: string, score: number, connectionId: string | null, now = Date.now()) {
  if (!room && connectionId) return room;
  const member = room?.players?.[uid];
  if (connectionId && (member?.connectionId !== connectionId || member?.left || member?.roundId !== room?.roundId || (room?.status !== 'started' && room?.status !== 'ended'))) return;
  return { ...room, ...(!room?.hostId ? { hostId: uid, isSolo: true } : {}), scores: { ...room?.scores, [uid]: {
    ...room?.scores?.[uid], score, finished: true,
    currentQuestionId: null, currentQuestionLabel: null, updatedAt: now,
  } } };
}

// RTDB transaction body for a presence ping. Progress comes from the database,
// never the client; a completed attempt is always reported as finished.
export function presenceScore(current: Partial<PlayerScore> | null, question: { id: string; question_order: number } | null, completed: boolean, now = Date.now()) {
  if (!current) return current;
  return { ...current, currentQuestionId: question?.id ?? null,
    currentQuestionLabel: question ? `Q${question.question_order + 1}` : null,
    ...(completed ? { finished: true } : {}), updatedAt: now };
}
