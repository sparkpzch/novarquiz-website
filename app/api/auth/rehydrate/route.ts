import { authorizeCurrentSession } from '@/lib/security/live-session';
// Mints a short-lived Firebase custom token from a valid HTTP-only session
// cookie. Used by the client AuthProvider to re-establish a Firebase session
// when IndexedDB has been cleared (private mode, new browser) but the server
// session cookie is still valid. Without this, users with a valid cookie but
// no client-side Firebase state briefly land on /sign-in before being bounced
// back by the proxy.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { verifySessionToken, SESSION_VERSION } from '@/lib/security/session';
import { adminAuth } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { getRateLimitIp } from '@/lib/security/request-ip';

const COOKIE_NAME = 'session';
const ADMIN_MAX_AGE = 60 * 60 * 24; // 24h cap for admins (mirrors session/route.ts)

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit BEFORE touching cookie/JWT verify. ROUTE_LIMITS caps this
    // path at 5/min — previously declared but never enforced.
    const { allowed, retryAfter } = await checkRateLimit(
      getRateLimitIp(request),
      '/api/auth/rehydrate',
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const cookieStore = await cookies();
    const session = cookieStore.get(COOKIE_NAME)?.value;
    if (!session) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const verified = await verifySessionToken(session);
    const uid = verified.uid;
    // Re-check live Firebase claims so a revoked admin loses access within one rehydrate cycle
    const firebaseUser = await adminAuth.getUser(uid);
    try { authorizeCurrentSession(verified, firebaseUser); }
    catch {
      cookieStore.delete(COOKIE_NAME);
      return NextResponse.json({ error: 'Session revoked' }, { status: 401 });
    }
    if (firebaseUser.disabled) {
      cookieStore.delete(COOKIE_NAME);
      return NextResponse.json({ error: 'Account disabled' }, { status: 401 });
    }
    const currentIsAdmin = verified.isAdmin && firebaseUser.customClaims?.admin === true;
    const tokenIsAdmin = verified.isAdmin;

    if (currentIsAdmin !== tokenIsAdmin) {
      const remaining = verified.expiresAt - Math.floor(Date.now() / 1000);
      const maxAge = currentIsAdmin ? Math.min(remaining, ADMIN_MAX_AGE) : remaining;

      if (maxAge <= 0) {
        cookieStore.delete(COOKIE_NAME);
        return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      }

      const newToken = await new SignJWT({ uid, isAdmin: currentIsAdmin, sessionVersion: SESSION_VERSION, authTime: verified.authTime, userSessionVersion: verified.userSessionVersion })
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

    const customToken = await adminAuth.createCustomToken(uid, { applicationAuthTime: verified.authTime, applicationSessionVersion: verified.userSessionVersion });
    return NextResponse.json({ customToken });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
