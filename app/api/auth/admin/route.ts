import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Only an already-authenticated admin may promote other accounts.
  // The requester is identified from the session cookie — never from the request body.
  const requester = await getSessionUser();
  if (!requester?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const user = await adminAuth.getUserByEmail(email);
    await adminAuth.setCustomUserClaims(user.uid, { admin: true });

    // Structured audit trail. Stdout is captured by Cloud Logging on Firebase
    // App Hosting. If this surfaces a real ops need, promote to a dedicated
    // `admin_audit_log` table.
    console.warn(
      JSON.stringify({
        event: 'admin.promote',
        actor_uid: requester.uid,
        target_uid: user.uid,
        target_email: email,
        at: new Date().toISOString(),
      }),
    );

    return NextResponse.json({ success: true, uid: user.uid });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
