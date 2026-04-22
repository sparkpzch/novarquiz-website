import { NextResponse } from 'next/server';
import { getSessionByShareToken } from '@/lib/db/queries';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const session = await getSessionByShareToken(token);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!session.is_published) return NextResponse.json({ error: 'Session is not published yet' }, { status: 403 });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
