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
import { readLobbyConnection, lobbyHeaders } from '@/lib/client/lobby-connection';
import { ROOM_STATUS, RoomStatus } from '../constants/session';

export const rtdb = getDatabase(app);

export function watchRealtimeConnection(callback: (connected: boolean) => void): () => void {
  return onValue(ref(rtdb, '.info/connected'), snapshot => callback(snapshot.val() === true));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitingPlayer = {
  displayName: string;
  photoURL: string | null;
  joinedAt: number;
  connectionId?: string;
  roundId?: string;
  lastActiveAt?: number;
  left?: boolean;
};

// export type RoomStatus = 'waiting' | 'started' | 'ended'; // Moved to constants/session.ts

export type SessionRoom = {
  status: RoomStatus;
  hostId: string;
  roundId?: string;
  connections?: Record<string, Record<string, Record<string, boolean>>>;
  leaderId?: string;
  joinToken?: string | null;
  players?: Record<string, WaitingPlayer>;
  scores?: Record<string, PlayerScore>;
};

export type TeamRoom = {
  sessionId: string;
  hostId: string;
  pin?: string;
  status: RoomStatus;
  players?: Record<string, WaitingPlayer>;
};

export async function getRoom(sessionId: string): Promise<SessionRoom | null> {
  const snap = await get(ref(rtdb, `sessions/${sessionId}`));
  return snap.val() as SessionRoom | null;
}

// ─── Host operations ─────────────────────────────────────────────────────────

async function changeHostedLobby(sessionId: string, action: 'open' | 'start' | 'close' | 'remove') {
  const response = await fetch(`/api/admin/sessions/${sessionId}/lobby`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update lobby');
  return data as { joinToken?: string };
}

export async function initRoom(sessionId: string, _hostId: string) { await changeHostedLobby(sessionId, 'open'); }
export async function reopenLobby(sessionId: string, _hostId: string) { await changeHostedLobby(sessionId, 'open'); }
export async function startRoom(sessionId: string) { await changeHostedLobby(sessionId, 'start'); }
export async function endRoom(sessionId: string) { await changeHostedLobby(sessionId, 'close'); }

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
  onValue(roomRef, handler, () => callback(null));
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

export function watchLobbyMembership(sessionId: string, uid: string, callback: (room: {
  status: RoomStatus | null; roundId: string | null; joinToken: string | null; member: WaitingPlayer | null;
}) => void): () => void {
  const state = { status: null as RoomStatus | null, roundId: null as string | null,
    joinToken: null as string | null, member: null as WaitingPlayer | null };
  const received = new Set<string>();
  const subscriptions = (['status', 'roundId', 'joinToken', 'member'] as const).map(field =>
    onValue(ref(rtdb, `sessions/${sessionId}/${field === 'member' ? `players/${uid}` : field}`), snapshot => {
      Object.assign(state, { [field]: snapshot.val() });
      received.add(field);
      if (received.size === 4) callback({ ...state });
    }, () => callback({ status: null, roundId: null, joinToken: null, member: null })));
  return () => subscriptions.forEach(stop => stop());
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
  roundId?: string;
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
  if (readLobbyConnection(sessionId, uid)) {
    const response = await fetch(`/api/play/${sessionId}/presence`, {
      method: 'POST', headers: lobbyHeaders(sessionId, uid, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentQuestionId: metadata.currentQuestionId, currentQuestionLabel: metadata.currentQuestionLabel }),
    });
    if (!response.ok) throw new Error('Connection is no longer active');
    return;
  }
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
  onValue(scoresRef, handler, () => callback({}));
  return () => off(scoresRef, 'value', handler);
}

// ─── Per-lobby join tokens ────────────────────────────────────────────────────
//
// A join token is minted when an admin opens the lobby for a session. The token
// lives in RTDB under `joinTokens/{token}` (reverse index → sessionId) and is
// mirrored at `sessions/{sessionId}/joinToken` for convenience. When the lobby
// closes (or the game ends) the token is deleted so the shared URL stops working.

export async function openLobby(sessionId: string): Promise<string> {
  const response = await fetch(`/api/admin/sessions/${sessionId}/lobby`, {cache:'no-store'});
  if (!response.ok) throw new Error('Could not load invitation');
  const room = await response.json();
  if (room?.joinToken) return room.joinToken as string;
  const result = await changeHostedLobby(sessionId, 'open');
  if (!result.joinToken) throw new Error('No invitation available');
  return result.joinToken;
}
export async function closeLobby(sessionId: string) { await changeHostedLobby(sessionId, 'close'); }
export async function removeRoom(sessionId: string) { await changeHostedLobby(sessionId, 'remove'); }

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
  lastActiveAt?: number;
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
  await onDisconnect(entryRef).remove();
  await set(entryRef, entry);
}

export async function untrackUserSession(
  uid: string,
  sessionId: string,
  roomId?: string,
): Promise<void> {
  if (readLobbyConnection(sessionId, uid)) return;
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
    if (entry.sessionId === sessionId && !(entry as UserSessionEntry & { connectionId?: string }).connectionId) updates[id] = null;
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
  const response = await fetch('/api/team-rooms', {method:'POST',headers:lobbyHeaders(sessionId,host.uid,{'Content-Type':'application/json'}),body:JSON.stringify({sessionId})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not create team room');
  return data as {roomId:string;pin:string};
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
  return true;
}

export async function leaveTeamRoom(roomId: string, uid: string) {
  const response = await fetch(`/api/team-rooms/${roomId}`, {method:'DELETE'});
  if (!response.ok) throw new Error('Could not leave team room');
}

export async function startTeamRoom(roomId: string) {
  const response = await fetch(`/api/team-rooms/${roomId}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start'})});
  if (!response.ok) throw new Error('Could not start team room');
}

export function watchTeamRoom(
  roomId: string,
  callback: (room: TeamRoom | null) => void,
): () => void {
  const roomRef = ref(rtdb, `teamRooms/${roomId}`);
  const handler = (snap: DataSnapshot) => callback(snap.val() as TeamRoom | null);
  onValue(roomRef, handler, () => callback(null));
  return () => off(roomRef, 'value', handler);
}

// A play layout survives lobby → question navigation. Refresh only existing
// index entries so completed/removed entries cannot be resurrected by a timer.
export function maintainSessionPresence(uid: string, sessionId: string): () => void {
  const connection = readLobbyConnection(sessionId, uid);
  if (connection) {
    let stopped = false;
    const transportId = crypto.randomUUID();
    const presenceRef = ref(rtdb, `sessions/${sessionId}/connections/${uid}/${connection.connectionId}/${transportId}`);
    const heartbeat = () => fetch(`/api/play/${sessionId}/presence`, {
      method: 'POST', headers: lobbyHeaders(sessionId, uid, { 'Content-Type': 'application/json' }), body: '{}',
    }).catch(() => {});
    const unsubscribe = onValue(ref(rtdb, '.info/connected'), snapshot => {
      if (snapshot.val() === true) void (async () => {
        await onDisconnect(presenceRef).remove();
        if (!stopped) { await set(presenceRef, true); void heartbeat(); }
      })().catch(() => {});
    });
    const timer = setInterval(() => { if (!stopped) void heartbeat(); }, 30_000);
    return () => { stopped = true; clearInterval(timer); unsubscribe(); void set(presenceRef, null).catch(() => {}); };
  }
  let stopped = false;
  let updating = false;
  const refresh = async () => {
    if (stopped || updating) return;
    updating = true;
    try {
      const snapshot = await get(ref(rtdb, `userSessions/${uid}`));
      const entries = (snapshot.val() ?? {}) as Record<string, UserSessionEntry>;
      await Promise.all(Object.entries(entries).filter(([, entry]) => entry.sessionId === sessionId && !(entry as UserSessionEntry & { connectionId?: string }).connectionId).map(async ([id, entry]) => {
        if (stopped) return;
        const entryRef = ref(rtdb, `userSessions/${uid}/${id}`);
        const playerRef = ref(rtdb, entry.roomId
          ? `teamRooms/${entry.roomId}/players/${uid}`
          : `sessions/${sessionId}/players/${uid}`);
        await onDisconnect(entryRef).remove();
        if (!entry.roomId) await onDisconnect(playerRef).remove();
        if (stopped) return;
        await runTransaction(entryRef, current => current ? { ...current, lastActiveAt: Date.now() } : undefined);
      }));
    } catch (error) {
      console.error('Could not refresh session presence:', error);
    } finally {
      updating = false;
    }
  };
  const unsubscribe = onValue(ref(rtdb, '.info/connected'), snapshot => {
    if (snapshot.val() === true) void refresh();
  });
  const timer = setInterval(() => void refresh(), 30_000);
  return () => { stopped = true; clearInterval(timer); unsubscribe(); };
}
