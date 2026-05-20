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
    if (!session.is_private) {
      return NextResponse.json(leaderboard.map(({ user_id: _, ...rest }) => rest));
    }
    return NextResponse.json(leaderboard);
  } catch (err) {
    console.error(`Failed to load leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
