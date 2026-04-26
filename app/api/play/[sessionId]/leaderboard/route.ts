import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const leaderboard = await getLeaderboard(sessionId);
    return NextResponse.json(leaderboard);
  } catch (err) {
    console.error(`Failed to load play leaderboard for session ${sessionId}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
