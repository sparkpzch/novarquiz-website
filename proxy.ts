import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';
import { getRateLimitIp } from '@/lib/security/request-ip';
import { isTrustedMutation } from '@/lib/security/request-origin';
import { verifySessionToken } from '@/lib/security/session';
import { authReturnPath, authHref } from '@/lib/security/auth-return';

const COOKIE_NAME = 'session';
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/forgot-password', '/new-password', '/terms', '/privacy'];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebasedatabase.app${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://storage.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app",
    "media-src 'self' blob: https://storage.googleapis.com https://firebasestorage.googleapis.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.upstash.io https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseapp.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com",
    "font-src 'self'",
    "frame-src 'self' https://*.firebaseapp.com https://*.firebaseauth.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

function withCsp(request: NextRequest, nonce: string): NextResponse {
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js reads the nonce from the CSP on the *request* headers during SSR to
  // stamp it onto framework/bundle <script> tags. Without this, 'strict-dynamic'
  // blocks those scripts. See node_modules/next/dist/docs/.../content-security-policy.md
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit all API routes
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (!isTrustedMutation(request)) {
      return NextResponse.json({ error: 'Cross-origin request denied' }, { status: 403 });
    }
    // Logging out only expires this browser's cookie. A spent login budget
    // must never prevent it, while the Origin check above still prevents CSRF.
    if (pathname === '/api/auth/session' && request.method === 'DELETE') {
      return NextResponse.next();
    }
    // On Cloud Run / Firebase App Hosting the platform appends the real client
    // IP as the LAST entry in x-forwarded-for. Only honor these headers when
    // TRUST_PROXY=1 is set, since direct ingress (local dev, misrouted Cloud
    // Run revisions) lets an attacker forge them to rotate rate-limit buckets.
    // When unset, fall back to a fixed bucket so abuse is globally capped.
    const ip = getRateLimitIp(request);

    const { allowed, retryAfter } = await checkRateLimit(ip, pathname, 'ingress');
    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
    return NextResponse.next();
  }

  // Only known asset namespaces bypass authentication. An arbitrary dynamic
  // route ending in .json/.png is still a protected page.
  if (pathname.startsWith('/_next/') || pathname.startsWith('/image/') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Per-request nonce for nonce-based CSP (applied to all page responses below).
  const nonce = btoa(crypto.randomUUID());

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const session = request.cookies.get(COOKIE_NAME)?.value;


  // Authenticated users are redirected away from auth pages
  if (isPublic) {
    if (session) {
      try {
        const user = await verifySessionToken(session);
        if (!['/terms', '/privacy'].includes(pathname)) {
          return NextResponse.redirect(new URL(authReturnPath(request.nextUrl.searchParams.get('next'), user.isAdmin ? '/admin' : '/'), request.url));
        }
      } catch {
        // Expired / invalid — let through to sign-in
      }
    }
    return withCsp(request, nonce);
  }

  // Unauthenticated → sign-in
  if (!session) {
    return NextResponse.redirect(
      new URL(authHref('/sign-in', pathname + request.nextUrl.search), request.url),
    );
  }

  try {
    const user = await verifySessionToken(session);
    if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !user.isAdmin) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return withCsp(request, nonce);
  } catch {
    const res = NextResponse.redirect(new URL(authHref('/sign-in', pathname + request.nextUrl.search), request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
