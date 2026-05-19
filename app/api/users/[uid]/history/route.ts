import { NextResponse, type NextRequest } from 'next/server';
import { getUserHistory } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

// Personal play history for a specific user across every session they've
// completed. Powers the /history "My attempts" view.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;
  if (!uid) return NextResponse.json([], { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.isAdmin && user.uid !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rows = await getUserHistory(uid);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('history failed:', err);
    return NextResponse.json([], { status: 500 });
  }
}
