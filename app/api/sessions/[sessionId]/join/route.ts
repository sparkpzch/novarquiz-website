import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRtdb } from '@/lib/firebase/admin';
import { getSessionById, withPlayerAnswerLock } from '@/lib/db/queries';
import { resetProgress } from '@/lib/db/play-progress';
import { getPlayUser } from '@/lib/play-auth';
import { ROOM_STATUS } from '@/lib/constants/session';
import { sanitizePhotoUrl } from '@/lib/security/photo-url';

const JoinBody = z.object({
  displayName: z.string().max(100).optional(),
  photoURL: z.string().url().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  try {
    // 1. Authenticate user
    const user = await getPlayUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate session in DB
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 3. Check RTDB status
    const roomRef = adminRtdb.ref(`sessions/${sessionId}`);
    const roomSnap = await roomRef.once('value');
    const room = roomSnap.val();

    if (!room) {
      return NextResponse.json({ error: 'Room not initialized' }, { status: 400 });
    }

    if (room.status === ROOM_STATUS.ENDED) {
      return NextResponse.json({ error: 'Session has already ended' }, { status: 400 });
    }

    // 4. Join the room (Admin SDK write)
    const rawBody = await request.json().catch(() => ({}));
    const { data: body } = JoinBody.safeParse(rawBody);

    const playerRef = adminRtdb.ref(`sessions/${sessionId}/players/${user.uid}`);
    await playerRef.set({
      displayName: body?.displayName?.trim() || 'Anonymous',
      photoURL: sanitizePhotoUrl(body?.photoURL),
      joinedAt: Date.now(),
    });

    // First joiner becomes the leader. This must be server-side because
    // normal players are not allowed to write session-level fields in RTDB.
    const leaderRef = adminRtdb.ref(`sessions/${sessionId}/leaderId`);
    await leaderRef.transaction((current) => current ?? user.uid);

    // 5. Track user session (Fan-out index)
    const userSessionRef = adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`);
    await userSessionRef.set({
      sessionId,
      sessionName: session.name,
      mode: 'lobby',
      joinedAt: Date.now(),
    });

    // An explicit join starts another attempt after a completed game. Refreshing
    // gameplay only reads progress, and rejoining an unfinished game preserves it.
    await withPlayerAnswerLock(sessionId, user.uid, () => resetProgress(sessionId, user.uid));

    return NextResponse.json({
      success: true,
      sessionId,
      roomStatus: room.status,
      sessionName: session.name,
      description: session.description
    });

  } catch (error) {
    console.error('Error in Join API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
