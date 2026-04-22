import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'session';
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/forgot-password'];

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const session = request.cookies.get(COOKIE_NAME)?.value;

  if (isPublic) {
    if (session) {
      try {
        const { payload } = await jwtVerify(session, getSecret());
        return NextResponse.redirect(
          new URL(payload.isAdmin ? '/admin' : '/', request.url)
        );
      } catch {
        // Expired/invalid — let them through to sign-in
      }
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  try {
    const { payload } = await jwtVerify(session, getSecret());
    const isAdmin = !!payload.isAdmin;

    if (pathname.startsWith('/admin') && !isAdmin) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL('/sign-in', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
