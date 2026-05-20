import { NextResponse } from 'next/server';
import { getLeaderboard, getSessionById } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser();
    if (session.is_private && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leaderboard = await getLeaderboard(sessionId);

    // user_id is a Firebase UID and a stable join key for sensitive resources
    // elsewhere. Only the session owner and admins get raw UIDs; every other
    // caller sees each row's UID stripped except their own row, so the
    // viewer can still recognise themselves in the rankings.
    const isOwnerOrAdmin = !!user && (user.isAdmin || session.user_id === user.uid);
    if (isOwnerOrAdmin) return NextResponse.json(leaderboard);

    const viewerUid = user?.uid;
    return NextResponse.json(
      leaderboard.map(({ user_id, ...rest }) =>
        viewerUid && user_id === viewerUid ? { ...rest, user_id } : rest,
      ),
    );
  } catch (err) {
    console.error(`Failed to load play leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
