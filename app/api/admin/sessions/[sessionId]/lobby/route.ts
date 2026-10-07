import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { getSessionById, updateSession, withPlayerAnswerLock } from '@/lib/db/queries';
import { adminRtdb } from '@/lib/firebase/admin';
import { SESSION_STATUS } from '@/lib/constants/session';
import { lobbyStandings } from '@/lib/play/lobby-standings';

// An admin who is not the room owner reads through the live-authenticated API,
// rather than receiving broad Firebase permissions over every private lobby.
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { sessionId } = await params;
  const session = await getSessionById(sessionId);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val();
  return NextResponse.json(room, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { sessionId } = await params;
  const body = z.object({ action: z.enum(['open', 'start', 'close', 'remove']) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return await withPlayerAnswerLock(session.id, 'lobby-host', async () => {
      const roomRef = adminRtdb.ref(`sessions/${session.id}`);
      const room = (await roomRef.get()).val();
      const action = body.data.action;
      if (action === 'open') {
        const keep = room?.status === 'waiting' && !!room.joinToken;
        const joinToken = keep ? room.joinToken : randomBytes(18).toString('base64url');
        const next = keep ? { ...room, hostId: user.uid } : {
          status: 'waiting', hostId: user.uid, joinToken, roundId: randomUUID(),
        };
        await updateSession(session.id, { status: SESSION_STATUS.OPENED, pin_code: null });
        const updates: Record<string, unknown> = { [`sessions/${session.id}`]: next,
          [`joinTokens/${joinToken}`]: {sessionId:session.id,createdAt:Date.now()} };
        if (room?.joinToken && room.joinToken !== joinToken) updates[`joinTokens/${room.joinToken}`] = null;
        await adminRtdb.ref().update(updates);
        return NextResponse.json({ ok: true, joinToken });
      }
      if (action === 'remove') {
        const updates: Record<string, null> = { [`sessions/${session.id}`]: null };
        if (room?.joinToken) updates[`joinTokens/${room.joinToken}`] = null;
        await adminRtdb.ref().update(updates);
        return NextResponse.json({ ok: true });
      }
      if (!room) return NextResponse.json({ error: 'This lobby is unavailable.' }, { status: 404 });
      if (action === 'start' && (room.status !== 'waiting' || !room.joinToken ||
        (session.is_private && !lobbyStandings(room).some(player => player.connected)))) {
        return NextResponse.json({ error: 'Invite players before starting this quiz.' }, { status: 409 });
      }
      await updateSession(session.id, { status: action === 'start' ? SESSION_STATUS.STARTED : SESSION_STATUS.CLOSED,
        ...(action === 'close' ? { pin_code: null } : {}) });
      const changed = await roomRef.transaction(current => {
        if (!current) return current;
        if (current.roundId !== room.roundId || current.status !== room.status) return;
        return { ...current, status: action === 'start' ? 'started' : 'ended',
          ...(action === 'close' ? { joinToken: null } : {}) };
      });
      if (!changed.committed || !changed.snapshot.val()) throw new Error('The lobby changed. Refresh and try again.');
      if (action === 'close' && room.joinToken) await adminRtdb.ref(`joinTokens/${room.joinToken}`).remove();
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    console.error('Could not change lobby:', error);
    return NextResponse.json({ error: 'Could not update the lobby. Refresh and try again.' }, { status: 500 });
  }
}
