import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { syncUserProfile } from '@/lib/db/queries';
import { checkRateLimit } from '@/lib/ratelimit';
import { getRateLimitIp } from '@/lib/security/request-ip';

const COOKIE_NAME = 'session';
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 5;   // 5 days — session-scoped default
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days when user checks "remember me"
const ADMIN_MAX_AGE = 60 * 60 * 24;          // 24 h max for admins so claim revocation takes effect within a day

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit BEFORE the expensive verifyIdToken call so an attacker cannot
    // exhaust Firebase Auth quota by replaying junk tokens. ROUTE_LIMITS caps
    // this path at 10/min — previously declared but never enforced.
    const { allowed, retryAfter } = await checkRateLimit(
      getRateLimitIp(request),
      '/api/auth/session',
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const { idToken, rememberMe } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);

    // Password sign-ups must verify their email before we issue a session
    // cookie. OAuth providers deliver verified emails by construction, so
    // only the password provider is gated. Without this, anyone can
    // pre-create an account on an email they don't own.
    const provider = decoded.firebase?.sign_in_provider;
    if (provider === 'password' && !decoded.email_verified) {
      return NextResponse.json(
        { error: 'Email not verified', code: 'email-not-verified' },
        { status: 403 },
      );
    }

    // Sync profile to Postgres
    await syncUserProfile(decoded.uid, decoded.name || null, decoded.picture || null);

    const isAdmin = !!decoded.admin;
    const maxAge = isAdmin ? ADMIN_MAX_AGE : (rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE);

    const token = await new SignJWT({ uid: decoded.uid, isAdmin })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${maxAge}s`)
      .sign(getSecret());

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // 'lax' lets the cookie ride top-level cross-site navigations (OAuth
      // redirects, email-link sign-in), which 'strict' would block.
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    return NextResponse.json({ isAdmin });
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ success: true });
}
