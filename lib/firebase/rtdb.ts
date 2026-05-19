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
import { ROOM_STATUS, RoomStatus } from '../constants/session';

export const rtdb = getDatabase(app);

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitingPlayer = {
  displayName: string;
  photoURL: string | null;
  joinedAt: number;
};

// export type RoomStatus = 'waiting' | 'started' | 'ended'; // Moved to constants/session.ts

export type SessionRoom = {
  status: RoomStatus;
  hostId: string;
  leaderId?: string;
  joinToken?: string | null;
  players?: Record<string, WaitingPlayer>;
  scores?: Record<string, PlayerScore>;
};

export type TeamRoom = {
  sessionId: string;
  hostId: string;
  pin: string;
  status: RoomStatus;
  players?: Record<string, WaitingPlayer>;
};

export async function getRoom(sessionId: string): Promise<SessionRoom | null> {
  const snap = await get(ref(rtdb, `sessions/${sessionId}`));
  return snap.val() as SessionRoom | null;
}

// ─── Host operations ─────────────────────────────────────────────────────────

// Legacy: preserved for callers that just want to ensure a room exists in 'waiting'
// without disturbing live state. Admin lobby should call `reopenLobby` instead.
export async function initRoom(sessionId: string, hostId: string) {
  await runTransaction(ref(rtdb, `sessions/${sessionId}`), (current) => {
    if (current?.status === 'started' || current?.status === 'ended') return;
    return { ...(current ?? {}), status: ROOM_STATUS.WAITING, hostId };
  });
}

// Fully reset a session room when the admin (re-)opens the lobby. Wipes any
// stale players/scores from a previous game and forces status back to 'waiting',
// so new joiners don't auto-route to /question because of a leftover 'started' status.
export async function reopenLobby(sessionId: string, hostId: string): Promise<void> {
  await runTransaction(ref(rtdb, `sessions/${sessionId}`), (current) => {
    // First time: create fresh
    if (!current) return { status: ROOM_STATUS.WAITING, hostId };
    // Previous game finished — start clean (drop old players, scores, leaderId, joinToken)
    if (current.status === 'started' || current.status === 'ended') {
      return {
        status: ROOM_STATUS.WAITING,
        hostId,
        joinToken: current.joinToken ?? null,
      };
    }
    // Live waiting room — keep players, just refresh hostId
    return { ...current, hostId, status: ROOM_STATUS.WAITING };
  });
}

export async function startRoom(sessionId: string) {
  await set(ref(rtdb, `sessions/${sessionId}/status`), ROOM_STATUS.STARTED);
}

export async function endRoom(sessionId: string) {
  await set(ref(rtdb, `sessions/${sessionId}/status`), ROOM_STATUS.ENDED);
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

// Watches only the session status field — use this for players who only need to
// know when the game starts/ends, not the full room state (players, scores, etc.)
export function watchRoomStatus(
  sessionId: string,
  callback: (status: RoomStatus | null) => void,
): () => void {
  const statusRef = ref(rtdb, `sessions/${sessionId}/status`);
  const handler = (snap: DataSnapshot) => callback(snap.val() as RoomStatus | null);
  onValue(statusRef, handler);
  return () => off(statusRef, 'value', handler);
}

// Watches only the players map — use this for the lobby player grid so each
// player doesn't receive scores or other session-level data they don't need.
export function watchRoomPlayers(
  sessionId: string,
  callback: (players: Record<string, WaitingPlayer>) => void,
): () => void {
  const playersRef = ref(rtdb, `sessions/${sessionId}/players`);
  const handler = (snap: DataSnapshot) =>
    callback((snap.val() as Record<string, WaitingPlayer>) ?? {});
  onValue(playersRef, handler);
  return () => off(playersRef, 'value', handler);
}

export function watchSessionRooms(
  callback: (rooms: Record<string, SessionRoom>) => void,
): () => void {
  const sessionsRef = ref(rtdb, 'sessions');
  const handler = (snap: DataSnapshot) => callback((snap.val() as Record<string, SessionRoom>) ?? {});
  onValue(sessionsRef, handler);
  return () => off(sessionsRef, 'value', handler);
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
  // Optional: which question the player is currently viewing. Powers the
  // admin observation grid (#8). Null when finished or not yet navigated.
  currentQuestionId?: string | null;
  // Optional: human-readable label for the current question (e.g. "Q3" or
  // truncated text) so the admin grid doesn't have to look it up.
  currentQuestionLabel?: string | null;
  // Optional: player has reached the end of their path. Used by the admin
  // grid to render a "✓ done" badge instead of the current question.
  finished?: boolean;
  updatedAt: number;
};

export async function updateScore(
  sessionId: string,
  user: { uid: string; displayName: string | null; photoURL: string | null },
  score: number,
  extras?: { currentQuestionId?: string | null; currentQuestionLabel?: string | null; finished?: boolean },
): Promise<void> {
  await set(ref(rtdb, `sessions/${sessionId}/scores/${user.uid}`), {
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL,
    score,
    currentQuestionId: extras?.currentQuestionId ?? null,
    currentQuestionLabel: extras?.currentQuestionLabel ?? null,
    finished: extras?.finished ?? false,
    updatedAt: Date.now(),
  } satisfies PlayerScore);
}

export async function updatePlayerMetadata(
  sessionId: string,
  uid: string,
  metadata: {
    currentQuestionId?: string | null;
    currentQuestionLabel?: string | null;
    finished?: boolean;
  },
): Promise<void> {
  await update(ref(rtdb, `sessions/${sessionId}/scores/${uid}`), {
    ...metadata,
    updatedAt: Date.now(),
  });
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
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
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

// Completely removes a session's data from RTDB.
export async function removeRoom(sessionId: string): Promise<void> {
  // 1. Clear any associated join token
  await closeLobby(sessionId);
  // 2. Remove the session data itself
  await set(ref(rtdb, `sessions/${sessionId}`), null);
}

// Resolves a join token to a session id. Returns null if the token doesn't exist
// (i.e. the lobby was never opened or was closed).
export async function resolveJoinToken(token: string): Promise<string | null> {
  const snap = await get(ref(rtdb, `joinTokens/${token}`));
  const data = snap.val() as { sessionId: string; createdAt: number } | null;
  return data?.sessionId ?? null;
}

// ─── Per-user active-session index ────────────────────────────────────────────
//
// Fan-out index so we can answer "which live sessions is THIS user in?" without
// scanning every session. Written at join time, removed when the user leaves or
// finishes. Each entry is auto-pruned if the tab disconnects (onDisconnect).
//
// Path: userSessions/{uid}/{entryId}
//   entryId = sessionId for public lobbies,
//   entryId = `${sessionId}__${roomId}` for team rooms.

export type UserSessionEntry = {
  sessionId: string;
  sessionName: string;
  mode: 'lobby' | 'team' | 'solo';
  roomId?: string;
  joinedAt: number;
};

function userSessionEntryId(sessionId: string, roomId?: string): string {
  return roomId ? `${sessionId}__${roomId}` : sessionId;
}

export async function trackUserSession(
  uid: string,
  entry: UserSessionEntry,
): Promise<void> {
  const id = userSessionEntryId(entry.sessionId, entry.roomId);
  const entryRef = ref(rtdb, `userSessions/${uid}/${id}`);
  onDisconnect(entryRef).remove();
  await set(entryRef, entry);
}

export async function untrackUserSession(
  uid: string,
  sessionId: string,
  roomId?: string,
): Promise<void> {
  const id = userSessionEntryId(sessionId, roomId);
  await set(ref(rtdb, `userSessions/${uid}/${id}`), null);
}

// Removes every userSessions entry for this uid that references `sessionId`
// (both the public-lobby entry and any `${sessionId}__<roomId>` team entry).
// Used when the player finishes the session and we don't know which modes
// they joined through.
export async function untrackAllUserSessionsFor(
  uid: string,
  sessionId: string,
): Promise<void> {
  const snap = await get(ref(rtdb, `userSessions/${uid}`));
  const entries = (snap.val() as Record<string, UserSessionEntry> | null) ?? {};
  const updates: Record<string, null> = {};
  for (const [id, entry] of Object.entries(entries)) {
    if (entry.sessionId === sessionId) updates[id] = null;
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(rtdb, `userSessions/${uid}`), updates);
  }
}

export function watchUserSessions(
  uid: string,
  callback: (entries: Record<string, UserSessionEntry>) => void,
): () => void {
  const entriesRef = ref(rtdb, `userSessions/${uid}`);
  const handler = (snap: DataSnapshot) => callback((snap.val() as Record<string, UserSessionEntry>) ?? {});
  onValue(entriesRef, handler);
  return () => off(entriesRef, 'value', handler);
}

// ─── Team Room operations ─────────────────────────────────────────────────────

export async function createTeamRoom(
  sessionId: string,
  host: { uid: string; displayName: string | null; photoURL: string | null },
): Promise<{ roomId: string; pin: string }> {
  const randBytes = new Uint8Array(6);
  crypto.getRandomValues(randBytes);
  const roomId = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const pinArr = new Uint32Array(1);
  crypto.getRandomValues(pinArr);
  const pin = (100000 + (pinArr[0] % 900000)).toString();
  const playerRef = ref(rtdb, `teamRooms/${roomId}/players/${host.uid}`);
  onDisconnect(playerRef).remove();
  await set(ref(rtdb, `teamRooms/${roomId}`), {
    sessionId,
    hostId: host.uid,
    pin,
    status: ROOM_STATUS.WAITING,
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

// PIN is validated server-side; the API writes the player entry via Admin SDK.
export async function joinTeamRoom(
  roomId: string,
  pin: string,
  user: { uid: string; displayName: string | null; photoURL: string | null },
): Promise<boolean> {
  const res = await fetch(`/api/team-rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin,
      displayName: user.displayName,
      photoURL: user.photoURL,
    }),
  });
  if (!res.ok) return false;
  // Register disconnect cleanup so the player is removed if the tab closes
  const playerRef = ref(rtdb, `teamRooms/${roomId}/players/${user.uid}`);
  onDisconnect(playerRef).remove();
  return true;
}

export async function leaveTeamRoom(roomId: string, uid: string) {
  await set(ref(rtdb, `teamRooms/${roomId}/players/${uid}`), null);
}

export async function startTeamRoom(roomId: string) {
  await set(ref(rtdb, `teamRooms/${roomId}/status`), ROOM_STATUS.STARTED);
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
