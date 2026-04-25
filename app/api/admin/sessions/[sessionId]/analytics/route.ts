import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getSessionAnalytics } from '@/lib/db/queries';

function getSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!);
}

async function verifyAdmin(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return false;
  try {
    const { payload } = await jwtVerify(session, getSecret());
    return !!payload.isAdmin;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!(await verifyAdmin(request))) {
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
