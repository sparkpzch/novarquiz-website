import { adminRtdb } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/db/queries';
import { getPlayUser } from '@/lib/play-auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { lobbyStandings } from '@/lib/play/lobby-standings';
import { maskLeaderboardEntry } from '@/lib/db/schema';

// Resolve the invitation and its current standings on the server so previewing
// a private lobby does not require membership or direct Firebase access.
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
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val();
    if (session.is_private) {
      if (!invitation || room?.joinToken !== token || room.status === 'ended') return NextResponse.json({ error: 'Invitation unavailable' }, { status: 404 });
    }
    // A valid invitation can preview standings before it creates membership.
    // Expose only display identities and scores, never lobby connection details.
    const leaderboard = lobbyStandings(room).map(player => {
      const masked = maskLeaderboardEntry({ user_id: player.uid });
      return {
        user_id: masked.user_id,
        user_display_name: player.displayName,
        user_photo_url: player.photoURL,
        total_score: player.score,
        rank: player.rank,
        is_me: player.uid === user.uid,
      };
    });
    return NextResponse.json({
      id: session.id,
      name: session.name,
      description: session.description,
      cover_image_url: session.cover_image_url,
      is_private: session.is_private,
      question_count: session.question_count,
      timer_seconds: session.timer_seconds,
      leaderboard,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Join API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
