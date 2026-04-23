import { NextResponse } from 'next/server';
import { completePlaySession } from '@/lib/db/queries';

// Called by the play page when the player reaches the end of their path
// (or runs out of time on the last question). Aggregates user_answers into
// leaderboard_entries and marks play_sessions.finished_at.
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();
    if (body.is_guest) return NextResponse.json({ is_guest: true });
    if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const result = await completePlaySession({
      session_id: sessionId,
      user_id: body.user_id,
      user_display_name: body.user_display_name || 'Anonymous',
      user_photo_url: body.user_photo_url ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
