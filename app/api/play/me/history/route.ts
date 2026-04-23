import { NextResponse, type NextRequest } from 'next/server';
import { getUserHistory } from '@/lib/db/queries';

// Personal play history for the signed-in user across every session they've
// completed. Powers the /history "My attempts" view.
//
// Auth note: identity is taken from the `?uid=` query param. The dashboard
// already authenticates via Firebase client SDK and we trust the uid for
// read-only personal history. If we ever need stricter checks, swap to a
// session cookie or ID-token verification.
export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json([], { status: 400 });
  try {
    const rows = await getUserHistory(uid);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('history failed:', err);
    return NextResponse.json([], { status: 500 });
  }
}
