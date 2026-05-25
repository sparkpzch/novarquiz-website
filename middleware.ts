import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { checkRateLimit } from '@/lib/ratelimit';

const COOKIE_NAME = 'session';
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/forgot-password'];

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit all API routes
  if (pathname.startsWith('/api')) {
    // On Cloud Run / Firebase App Hosting the platform appends the real client
    // IP as the LAST entry in x-forwarded-for. Prefer x-real-ip (set by the
    // infrastructure) and fall back to the last x-forwarded-for value so an
    // attacker cannot spoof the IP by injecting a forged first entry.
    const xff = request.headers.get('x-forwarded-for');
    const ip =
      request.headers.get('x-real-ip') ??
      (xff ? xff.split(',').at(-1)!.trim() : null) ??
      '127.0.0.1';

    const { allowed, retryAfter } = await checkRateLimit(ip, pathname);
    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
    return NextResponse.next();
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
    return NextResponse.next();
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
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/sign-in', request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
