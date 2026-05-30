import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { adminRtdb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';
import { sanitizePhotoUrl } from '@/lib/security/photo-url';

const MAX_PIN_ATTEMPTS = 5;

const JoinBody = z.object({
  pin: z.string().min(1).max(10).optional(),
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

  const parsed = JoinBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const snap = await adminRtdb.ref(`teamRooms/${roomId}`).once('value');
  const room = snap.val() as { hostId?: string; pin?: string; status?: string } | null;
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.status !== 'waiting') return NextResponse.json({ error: 'Room is not open' }, { status: 400 });

  // Host can rejoin without PIN; players must supply the correct PIN
  if (room.hostId !== user.uid) {
    const attemptsRef = adminRtdb.ref(`teamRooms/${roomId}/joinAttempts/${user.uid}`);
    const attempts = ((await attemptsRef.once('value')).val() as number | null) ?? 0;

    if (attempts >= MAX_PIN_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many PIN attempts' }, { status: 429 });
    }

    if (!pinMatches(room.pin, parsed.data.pin)) {
      await attemptsRef.set(attempts + 1);
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 });
    }

    await attemptsRef.remove();
  }

  await adminRtdb.ref(`teamRooms/${roomId}/players/${user.uid}`).set({
    displayName: parsed.data.displayName?.trim() || 'Anonymous',
    photoURL: sanitizePhotoUrl(parsed.data.photoURL),
    joinedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
