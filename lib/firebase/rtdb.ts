import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  off,
  onDisconnect,
  runTransaction,
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

// ─── Host operations ─────────────────────────────────────────────────────────

export async function initRoom(sessionId: string, hostId: string) {
  const roomRef = ref(rtdb, `sessions/${sessionId}`);
  await update(roomRef, { status: 'waiting', hostId });
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
  // Auto-remove on disconnect before writing so it's always set up
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

export function watchRoom(
  sessionId: string,
  callback: (room: SessionRoom | null) => void,
): () => void {
  const roomRef = ref(rtdb, `sessions/${sessionId}`);
  onValue(roomRef, snap => callback(snap.val() as SessionRoom | null));
  return () => off(roomRef);
}
