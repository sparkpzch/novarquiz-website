import { NextResponse } from 'next/server';
import { completeSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

// Called by the play page when the player reaches the end of their path
// (or runs out of time on the last question). Aggregates user_answers into
// leaderboard_entries and marks sessions.finished_at.
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();
    if (body.is_guest) return NextResponse.json({ is_guest: true });

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await completeSession({
      session_id: sessionId,
      user_id: user.uid,
      user_display_name: body.user_display_name || 'Anonymous',
      user_photo_url: body.user_photo_url ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
