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
