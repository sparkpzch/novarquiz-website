import { NextResponse } from 'next/server';
import { completeSession, getSessionById } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';

const TRUSTED_PHOTO_ORIGINS = new Set([
  'lh3.googleusercontent.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Anonymous';
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 100) || 'Anonymous';
}

function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const { hostname } = new URL(raw);
    return TRUSTED_PHOTO_ORIGINS.has(hostname) ? raw : null;
  } catch {
    return null;
  }
}

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

    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.user_id !== user.uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
