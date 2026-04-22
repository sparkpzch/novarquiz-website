import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, requester_uid } = body;

    // Verify requester is admin
    if (requester_uid) {
      const requester = await adminAuth.getUser(requester_uid);
      if (!requester.customClaims?.admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const user = await adminAuth.getUserByEmail(email);
    await adminAuth.setCustomUserClaims(user.uid, { admin: true });
    return NextResponse.json({ success: true, uid: user.uid });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
