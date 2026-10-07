import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedFirebaseIdentity } from '@/lib/auth';
import { deleteUserData } from '@/lib/db/queries';

// Deletes all analytics rows tied to a Firebase UID. Requires a valid ID token
// belonging to the same user (admins may delete any user's data).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const authHeader = request.headers.get('authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
  }

  let decoded;
  try { decoded = await getVerifiedFirebaseIdentity(idToken); }
  catch { return NextResponse.json({error:'Invalid auth token'}, {status:401}); }
  try {
    if (decoded.uid !== uid && !decoded.admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await deleteUserData(uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
