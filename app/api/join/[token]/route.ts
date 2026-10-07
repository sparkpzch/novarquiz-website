import { adminRtdb } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/db/queries';
import { getPlayUser } from '@/lib/play-auth';
import { checkRateLimit } from '@/lib/ratelimit';

// Join tokens are resolved via Firebase RTDB (resolveJoinToken).
// The client resolves the token to a sessionId client-side, then fetches
// the session by ID. This route provides a server-side fallback for full tokens.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getPlayUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/join');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { token } = await params;
  try {
    const invitation = (await adminRtdb.ref(`joinTokens/${token}`).get()).val();
    const session = invitation?.sessionId
      ? await getSessionByToken(invitation.sessionId) : await getSessionByToken(token);
    if (session?.is_private) {
      const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val();
      if (!invitation || room?.joinToken !== token || room.status === 'ended') return NextResponse.json({ error: 'Invitation unavailable' }, { status: 404 });
    }
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({
      id: session.id,
      name: session.name,
      description: session.description,
      cover_image_url: session.cover_image_url,
      is_private: session.is_private
    });
  } catch (error) {
    console.error('Join API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
