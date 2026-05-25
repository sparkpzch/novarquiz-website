import { NextResponse } from 'next/server';
import { completeSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { sanitizeDisplayName, sanitizePhotoUrl } from '@/lib/security';

// Called by the play page when the player reaches the end of their path
// (or runs out of time on the last question). Aggregates user_answers into
// leaderboard_entries and marks sessions.finished_at.
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    // Authenticate before reading the body. The previous order short-circuited
    // on a client-controlled `is_guest` flag; reviewers would assume the route
    // was authenticated when it wasn't for that branch.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    const result = await completeSession({
      session_id: sessionId,
      user_id: user.uid,
      user_display_name: sanitizeDisplayName(body.user_display_name),
      user_photo_url: sanitizePhotoUrl(body.user_photo_url),
    });

    void adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
      finished: true,
      currentQuestionId: null,
      updatedAt: Date.now(),
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    console.error('complete failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
