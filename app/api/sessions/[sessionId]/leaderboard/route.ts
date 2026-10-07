import { adminRtdb } from '@/lib/firebase/admin';
import { requireLobbyAccess } from '@/lib/play/lobby-access';
import { NextResponse } from 'next/server';
import { getLeaderboard, getSessionById } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser();
    if (session.is_private && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    console.error(`Failed to load leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
