import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRtdb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';
import { checkCustomRateLimit } from '@/lib/ratelimit';
import { sanitizeDisplayName, sanitizePhotoUrl } from '@/lib/security';

const JoinBody = z.object({
  pin: z.string().min(1).max(10).optional(),
  displayName: z.string().max(100).optional(),
  photoURL: z.string().url().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId } = await params;

  // Two-axis rate limit: per-user caps a single account's PIN attempts across
  // all rooms; per-room caps total guess rate against any single PIN. Either
  // tripping returns 429 — together they make 10⁴ brute force impractical.
  const userLimit = await checkCustomRateLimit(`teamjoin:user:${user.uid}`, 10);
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(userLimit.retryAfter) } },
    );
  }
  const roomLimit = await checkCustomRateLimit(`teamjoin:room:${roomId}`, 20);
  if (!roomLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(roomLimit.retryAfter) } },
    );
  }

  const parsed = JoinBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const snap = await adminRtdb.ref(`teamRooms/${roomId}`).once('value');
  const room = snap.val() as { hostId?: string; pin?: string; status?: string } | null;
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.status !== 'waiting') return NextResponse.json({ error: 'Room is not open' }, { status: 400 });

  // Host can rejoin without PIN; players must supply the correct PIN.
  if (room.hostId !== user.uid) {
    if (!parsed.data.pin || room.pin !== parsed.data.pin) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 });
    }
  }

  await adminRtdb.ref(`teamRooms/${roomId}/players/${user.uid}`).set({
    displayName: sanitizeDisplayName(parsed.data.displayName),
    photoURL: sanitizePhotoUrl(parsed.data.photoURL),
    joinedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
