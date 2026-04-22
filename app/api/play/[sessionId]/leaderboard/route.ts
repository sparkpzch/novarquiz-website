import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const entries = await getLeaderboard(sessionId);
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
