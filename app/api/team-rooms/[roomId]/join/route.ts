import { readTeamRoom, validTeamRoomId } from '@/lib/play/team-room';
import { checkRateLimit } from '@/lib/ratelimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { adminRtdb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';
import { sanitizePhotoUrl } from '@/lib/security/photo-url';

const MAX_PIN_ATTEMPTS = 5;

const JoinBody = z.object({
  pin: z.string().regex(/^\d{6}$/).optional(),
  displayName: z.string().max(100).optional(),
  photoURL: z.string().url().max(500).optional().nullable(),
});

function pinMatches(stored: string | undefined, supplied: string | undefined): boolean {
  if (!stored || !supplied || stored.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId } = await params;
  if (!validTeamRoomId(roomId)) return NextResponse.json({error:'Not found'}, {status:404});
  const limit = await checkRateLimit(`uid:${user.uid}`, '/api/team-rooms');
  if (!limit.allowed) return NextResponse.json({error:'Too many requests'}, {status:429});

  const parsed = JoinBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const room = await readTeamRoom(roomId);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.status !== 'waiting') return NextResponse.json({ error: 'Room is not open' }, { status: 400 });

  // Host can rejoin without PIN; players must supply the correct PIN
  if (room.hostId !== user.uid) {
    const attemptsRef = adminRtdb.ref(`teamRoomSecrets/${roomId}/joinAttempts/${user.uid}`);
    // Count before checking the PIN so concurrent requests cannot all read the
    // same counter and bypass the five-attempt budget.
    const spent = await attemptsRef.transaction(current => (current ?? 0) >= MAX_PIN_ATTEMPTS ? undefined : (current ?? 0) + 1);
    if (!spent.committed) return NextResponse.json({ error: 'Too many PIN attempts' }, { status: 429 });
    const storedPin = (await adminRtdb.ref(`teamRoomSecrets/${roomId}/pin`).get()).val();
    if (!pinMatches(storedPin, parsed.data.pin)) return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 });

    await attemptsRef.remove();
  }

  const admitted = await adminRtdb.ref(`teamRooms/${roomId}`).transaction(current => {
    if (!current) return current;
    if (current.status !== 'waiting') return;
    return {...current,players:{...current.players,[user.uid]:{
      displayName: parsed.data.displayName?.trim() || 'Player',
      photoURL: sanitizePhotoUrl(parsed.data.photoURL), joinedAt: Date.now(),
    }}};
  });
  if (!admitted.committed || !admitted.snapshot.val()?.players?.[user.uid]) return NextResponse.json({error:'Room is not open'}, {status:409});

  return NextResponse.json({ ok: true });
}
