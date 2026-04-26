import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/db/queries';

// Join tokens are resolved via Firebase RTDB (resolveJoinToken).
// The client resolves the token to a sessionId client-side, then fetches
// the session by ID. This route provides a server-side fallback for full tokens.
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const session = await getSessionByToken(token);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({
      id: session.id, // This is the instance ID
      name: session.name,
      description: session.quiz_description,
      is_private: session.is_private
    });
  } catch (error) {
    console.error('Join API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
