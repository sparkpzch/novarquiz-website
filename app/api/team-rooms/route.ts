import { randomBytes, randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { getQuizById, getSessionById } from '@/lib/db/queries';
import { adminAuth, adminRtdb } from '@/lib/firebase/admin';
import { requireLobbyAccess } from '@/lib/play/lobby-access';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = z.object({ sessionId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid quiz' }, { status: 400 });
  const limit = await checkRateLimit(`uid:${user.uid}`, '/api/team-rooms');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, {status:429});
  try {
    const session = await getSessionById(body.data.sessionId);
    const quiz = await getQuizById(session?.session_id ?? body.data.sessionId);
    if (!quiz || (!quiz.is_published && !user.isAdmin && quiz.created_by !== user.uid)) return NextResponse.json({error:'Not found'}, {status:404});
    if (session?.is_private) {
      const denied = await requireLobbyAccess(request, session.id, user.uid, false);
      if (denied) return denied;
    }
    const roomId = randomBytes(12).toString('hex'), pin = String(randomInt(100000,1000000));
    const profile = await adminAuth.getUser(user.uid);
    await adminRtdb.ref().update({
      [`teamRooms/${roomId}`]: { sessionId: body.data.sessionId, hostId: user.uid, status:'waiting',
        players: { [user.uid]: {displayName:profile.displayName || 'Player',photoURL:profile.photoURL || null,joinedAt:Date.now()} } },
      [`teamRoomSecrets/${roomId}`]: { pin },
    });
    return NextResponse.json({roomId,pin}, {headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Could not create room'}, {status:500}); }
}
