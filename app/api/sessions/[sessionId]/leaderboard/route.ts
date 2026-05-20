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
    const isOwnerOrAdmin = !!user && (user.isAdmin || session.user_id === user.uid);
    if (isOwnerOrAdmin) return NextResponse.json(leaderboard);

    const viewerUid = user?.uid;
    return NextResponse.json(
      leaderboard.map(({ user_id, ...rest }) =>
        viewerUid && user_id === viewerUid ? { ...rest, user_id } : rest,
      ),
    );
  } catch (err) {
    console.error(`Failed to load leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
