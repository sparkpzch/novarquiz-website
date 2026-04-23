// Mints a short-lived Firebase custom token from a valid HTTP-only session
// cookie. Used by the client AuthProvider to re-establish a Firebase session
// when IndexedDB has been cleared (private mode, new browser) but the server
// session cookie is still valid. Without this, users with a valid cookie but
// no client-side Firebase state briefly land on /sign-in before being bounced
// back by the proxy.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { adminAuth } from '@/lib/firebase/admin';

const COOKIE_NAME = 'session';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(COOKIE_NAME)?.value;
    if (!session) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const { payload } = await jwtVerify(session, getSecret());
    const uid = payload.uid as string | undefined;
    if (!uid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
