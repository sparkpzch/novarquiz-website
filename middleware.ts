import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { checkRateLimit } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/security';

const COOKIE_NAME = 'session';
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/forgot-password'];

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit all API routes. Key on uid when a valid session cookie is
  // present so that the limit is per-user, not per-IP. Per-IP keying collapses
  // to a single bucket for all users when TRUST_PROXY is unset (the default in
  // most environments), enabling a single account to exhaust the login limit
  // for every user on the platform.
  if (pathname.startsWith('/api')) {
    let rateLimitKey = getClientIp(request);
    const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
    if (sessionCookie) {
      try {
        const { payload } = await jwtVerify(sessionCookie, getSecret());
        if (typeof payload.uid === 'string') rateLimitKey = `uid:${payload.uid}`;
      } catch { /* invalid/expired cookie — fall back to IP key */ }
    }
    const { allowed, retryAfter } = await checkRateLimit(rateLimitKey, pathname);
    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // Pass through static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const session = request.cookies.get(COOKIE_NAME)?.value;

  // Authenticated users are redirected away from auth pages
  if (isPublic) {
    if (session) {
      try {
        const { payload } = await jwtVerify(session, getSecret());
        return NextResponse.redirect(new URL(payload.isAdmin ? '/admin' : '/', request.url));
      } catch {
        // Expired / invalid — let through to sign-in
      }
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // Unauthenticated → sign-in
  if (!session) {
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(pathname)}`, request.url),
    );
  }

  try {
    const { payload } = await jwtVerify(session, getSecret());
    if (pathname.startsWith('/admin') && !payload.isAdmin) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return addSecurityHeaders(NextResponse.next());
  } catch {
    const res = NextResponse.redirect(new URL('/sign-in', request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
