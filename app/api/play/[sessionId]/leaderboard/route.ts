import { requireLobbyAccess } from '@/lib/play/lobby-access';
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

    if (session.is_private && user && !user.isAdmin && session.user_id !== user.uid) {
      const denied = await requireLobbyAccess(request, session.id, user.uid, false);
      if (denied) return denied;
    }

    const room = session.is_private ? (await adminRtdb.ref(`sessions/${session.id}`).get()).val() : null;
    const currentParticipants = room?.roundId ? Object.keys(room.scores ?? {}).filter(uid =>
      room.scores[uid].roundId === room.roundId && room.scores[uid].finished === true) : undefined;
    const leaderboard = await getLeaderboard(session.id, user?.uid, currentParticipants);
    return NextResponse.json(leaderboard);
  } catch (err) {
    console.error(`Failed to load play leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
