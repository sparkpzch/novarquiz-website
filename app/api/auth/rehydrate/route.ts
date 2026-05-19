// Mints a short-lived Firebase custom token from a valid HTTP-only session
// cookie. Used by the client AuthProvider to re-establish a Firebase session
// when IndexedDB has been cleared (private mode, new browser) but the server
// session cookie is still valid. Without this, users with a valid cookie but
// no client-side Firebase state briefly land on /sign-in before being bounced
// back by the proxy.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { adminAuth } from '@/lib/firebase/admin';

const COOKIE_NAME = 'session';
const ADMIN_MAX_AGE = 60 * 60 * 24; // 24h cap for admins (mirrors session/route.ts)

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

    // Re-check live Firebase claims so a revoked admin loses access within one rehydrate cycle
    const firebaseUser = await adminAuth.getUser(uid);
    const currentIsAdmin = !!(firebaseUser.customClaims as Record<string, unknown> | undefined)?.admin;
    const tokenIsAdmin = !!payload.isAdmin;

    if (currentIsAdmin !== tokenIsAdmin) {
      const remaining = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
      const maxAge = currentIsAdmin ? Math.min(remaining, ADMIN_MAX_AGE) : remaining;

      if (maxAge <= 0) {
        cookieStore.delete(COOKIE_NAME);
        return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      }

      const newToken = await new SignJWT({ uid, isAdmin: currentIsAdmin })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${maxAge}s`)
        .sign(getSecret());

      cookieStore.set(COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      });
    }

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
