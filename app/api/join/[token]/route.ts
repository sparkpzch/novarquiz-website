import { NextResponse } from 'next/server';
import { getSessionById } from '@/lib/db/queries';

// Join tokens are now resolved via Firebase RTDB (resolveJoinToken).
// The client resolves the token to a sessionId client-side, then fetches
// the session by ID. This route provides a server-side fallback.
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const session = await getSessionById(token);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!session.is_published) return NextResponse.json({ error: 'Session is not published yet' }, { status: 403 });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
