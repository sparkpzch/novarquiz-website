import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionById, withPlayerAnswerLock } from '@/lib/db/queries';
import { adminRtdb } from '@/lib/firebase/admin';
import { lobbyAccess, type LobbyState } from './lobby-policy';

export function connectionIdFor(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function requestConnectionId(request: Request) {
  const token = request.headers.get('X-Lobby-Connection');
  return token && /^[a-f0-9]{64}$/.test(token) ? connectionIdFor(token) : null;
}

// Solo quizzes have no lobby. A private hosted session requires a current
// invitation-derived connection, including for direct question URLs.
export async function requireLobbyAccess(request: Request, sessionId: string, uid: string, playing = true) {
  const session = await getSessionById(sessionId);
  if (!session) return null; // Published quiz IDs are handled by the quiz API.
  const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val() as LobbyState | null;
  if ((!room?.hostId || room.isSolo) && (!session.is_private || session.user_id === uid)) return null;
  if (!session.is_private && !room?.players?.[uid]?.connectionId) return null;
  const code = lobbyAccess(room, uid, requestConnectionId(request), playing);
  if (!code) return null;
  const messages = {
    closed: 'This lobby is closed.', invitation_required: 'Join using the invitation link or QR code.',
    session_replaced: 'This account is now playing on another device.', waiting: 'Waiting for the host to start the quiz.',
  };
  return NextResponse.json({ error: messages[code], code }, { status: code === 'session_replaced' ? 409 : 403 });
}

export class LobbyAccessError extends Error {
  constructor(public response: NextResponse) { super('Lobby access denied'); }
}

export async function withLobbyPlayerLock<T>(request: Request, sessionId: string, uid: string, work: () => Promise<T>) {
  return withPlayerAnswerLock(sessionId, uid, async () => {
    const denied = await requireLobbyAccess(request, sessionId, uid);
    if (denied) throw new LobbyAccessError(denied);
    return work();
  });
}
