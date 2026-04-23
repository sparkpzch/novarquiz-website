import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  off,
  onDisconnect,
  runTransaction,
  type DataSnapshot,
} from 'firebase/database';
import app from './config';

export const rtdb = getDatabase(app);

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitingPlayer = {
  displayName: string;
  photoURL: string | null;
  joinedAt: number;
};

export type RoomStatus = 'waiting' | 'started' | 'ended';

export type SessionRoom = {
  status: RoomStatus;
  hostId: string;
  leaderId?: string;
  players?: Record<string, WaitingPlayer>;
};

export type TeamRoom = {
  sessionId: string;
  hostId: string;
  pin: string;
  status: RoomStatus;
  players?: Record<string, WaitingPlayer>;
};

// ─── Host operations ─────────────────────────────────────────────────────────

// Safe init: never overwrites a room that is already started/ended
export async function initRoom(sessionId: string, hostId: string) {
  await runTransaction(ref(rtdb, `sessions/${sessionId}`), (current) => {
    if (current?.status === 'started' || current?.status === 'ended') return;
    return { ...(current ?? {}), status: 'waiting', hostId };
  });
}

export async function startRoom(sessionId: string) {
  await set(ref(rtdb, `sessions/${sessionId}/status`), 'started');
}

export async function endRoom(sessionId: string) {
  await set(ref(rtdb, `sessions/${sessionId}/status`), 'ended');
}

// ─── Player operations ────────────────────────────────────────────────────────

export async function joinWaitingRoom(
  sessionId: string,
  user: { uid: string; displayName: string | null; photoURL: string | null },
) {
  const playerRef = ref(rtdb, `sessions/${sessionId}/players/${user.uid}`);
  onDisconnect(playerRef).remove();
  await set(playerRef, {
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL,
    joinedAt: Date.now(),
  } satisfies WaitingPlayer);
}

export async function leaveWaitingRoom(sessionId: string, uid: string) {
  await set(ref(rtdb, `sessions/${sessionId}/players/${uid}`), null);
}

// Sets leaderId only if no leader exists yet (first-joiner wins for public rooms)
export async function claimLeaderIfEmpty(sessionId: string, uid: string): Promise<void> {
  const leaderRef = ref(rtdb, `sessions/${sessionId}/leaderId`);
  await runTransaction(leaderRef, (current) => {
    if (current === null || current === undefined) return uid;
    return; // already claimed — abort transaction
  });
}

// ─── Real-time listener ───────────────────────────────────────────────────────

// Uses a named handler so cleanup only removes this specific subscription
export function watchRoom(
  sessionId: string,
  callback: (room: SessionRoom | null) => void,
): () => void {
  const roomRef = ref(rtdb, `sessions/${sessionId}`);
  const handler = (snap: DataSnapshot) => callback(snap.val() as SessionRoom | null);
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
}

// ─── Live score / leaderboard ────────────────────────────────────────────────
//
// Each player writes their running score to `sessions/{sessionId}/scores/{uid}`
// during a game. All players subscribe to the same path to render a live
// leaderboard. This is independent of the per-player graph traversal — scores
// update as each player answers their own question.

export type PlayerScore = {
  displayName: string;
  photoURL: string | null;
  score: number;
  updatedAt: number;
};

export async function updateScore(
  sessionId: string,
  user: { uid: string; displayName: string | null; photoURL: string | null },
  score: number,
): Promise<void> {
  await set(ref(rtdb, `sessions/${sessionId}/scores/${user.uid}`), {
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL,
    score,
    updatedAt: Date.now(),
  } satisfies PlayerScore);
}

export function watchScores(
  sessionId: string,
  callback: (scores: Record<string, PlayerScore>) => void,
): () => void {
  const scoresRef = ref(rtdb, `sessions/${sessionId}/scores`);
  const handler = (snap: DataSnapshot) => callback((snap.val() as Record<string, PlayerScore>) ?? {});
  onValue(scoresRef, handler);
  return () => off(scoresRef, 'value', handler);
}

// ─── Per-lobby join tokens ────────────────────────────────────────────────────
//
// A join token is minted when an admin opens the lobby for a session. The token
// lives in RTDB under `joinTokens/{token}` (reverse index → sessionId) and is
// mirrored at `sessions/{sessionId}/joinToken` for convenience. When the lobby
// closes (or the game ends) the token is deleted so the shared URL stops working.

function generateJoinToken(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// Mints a new join token (or reuses the existing one if the lobby is already open).
export async function openLobby(sessionId: string): Promise<string> {
  const existing = (await get(ref(rtdb, `sessions/${sessionId}/joinToken`))).val() as string | null;
  if (existing) return existing;

  const token = generateJoinToken();
  await set(ref(rtdb, `joinTokens/${token}`), { sessionId, createdAt: Date.now() });
  await set(ref(rtdb, `sessions/${sessionId}/joinToken`), token);
  return token;
}

// Invalidates the current join token for a session, if any.
export async function closeLobby(sessionId: string): Promise<void> {
  const token = (await get(ref(rtdb, `sessions/${sessionId}/joinToken`))).val() as string | null;
  if (!token) return;
  await set(ref(rtdb, `joinTokens/${token}`), null);
  await set(ref(rtdb, `sessions/${sessionId}/joinToken`), null);
}

// Resolves a join token to a session id. Returns null if the token doesn't exist
// (i.e. the lobby was never opened or was closed).
export async function resolveJoinToken(token: string): Promise<string | null> {
  const snap = await get(ref(rtdb, `joinTokens/${token}`));
  const data = snap.val() as { sessionId: string; createdAt: number } | null;
  return data?.sessionId ?? null;
}

// ─── Team Room operations ─────────────────────────────────────────────────────

export async function createTeamRoom(
  sessionId: string,
  host: { uid: string; displayName: string | null; photoURL: string | null },
): Promise<{ roomId: string; pin: string }> {
  const roomId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const playerRef = ref(rtdb, `teamRooms/${roomId}/players/${host.uid}`);
  onDisconnect(playerRef).remove();
  await set(ref(rtdb, `teamRooms/${roomId}`), {
    sessionId,
    hostId: host.uid,
    pin,
    status: 'waiting',
    players: {
      [host.uid]: {
        displayName: host.displayName || 'Anonymous',
        photoURL: host.photoURL,
        joinedAt: Date.now(),
      },
    },
  } satisfies TeamRoom);
  return { roomId, pin };
}

// Returns false if PIN is wrong or room is no longer waiting
export async function joinTeamRoom(
  roomId: string,
  pin: string,
  user: { uid: string; displayName: string | null; photoURL: string | null },
): Promise<boolean> {
  const snap = await get(ref(rtdb, `teamRooms/${roomId}`));
  const room = snap.val() as TeamRoom | null;
  if (!room || room.pin !== pin || room.status !== 'waiting') return false;
  const playerRef = ref(rtdb, `teamRooms/${roomId}/players/${user.uid}`);
  onDisconnect(playerRef).remove();
  await set(playerRef, {
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL,
    joinedAt: Date.now(),
  } satisfies WaitingPlayer);
  return true;
}

export async function leaveTeamRoom(roomId: string, uid: string) {
  await set(ref(rtdb, `teamRooms/${roomId}/players/${uid}`), null);
}

export async function startTeamRoom(roomId: string) {
  await set(ref(rtdb, `teamRooms/${roomId}/status`), 'started');
}

export function watchTeamRoom(
  roomId: string,
  callback: (room: TeamRoom | null) => void,
): () => void {
  const roomRef = ref(rtdb, `teamRooms/${roomId}`);
  const handler = (snap: DataSnapshot) => callback(snap.val() as TeamRoom | null);
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
}
