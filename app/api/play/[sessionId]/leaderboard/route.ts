import { NextResponse } from 'next/server';
import { getLeaderboard, getSessionById } from '@/lib/db/queries';
import { getPlayUser } from '@/lib/play-auth';
import { adminRtdb } from '@/lib/firebase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getPlayUser(request);
    if (session.is_private && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.is_private && user?.isGuest) {
      const player = await adminRtdb.ref(`sessions/${sessionId}/players/${user.uid}`).once('value');
      if (!player.exists()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const leaderboard = await getLeaderboard(sessionId, user?.uid);
    return NextResponse.json(leaderboard);
  } catch (err) {
    console.error(`Failed to load play leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
