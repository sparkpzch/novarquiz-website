import { NextResponse } from 'next/server';
import { getSessionAnalytics } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { sessionId } = await params;
  try {
    const analytics = await getSessionAnalytics(sessionId);
    if (!analytics) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Failed to fetch session analytics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
