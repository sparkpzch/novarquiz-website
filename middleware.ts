import { NextRequest, NextResponse } from 'next/server';

// In-process rate limiter. Effective per-instance only — for multi-instance
// production deployments, replace the store with Upstash Redis or similar.
const WINDOW_MS = 60_000; // 1 minute

// Route-prefix → max requests per window (most specific prefix wins)
const LIMITS: Array<[string, number]> = [
  ['/api/auth/session', 10],
  ['/api/upload', 5],
  ['/api/play', 60],
];
const DEFAULT_LIMIT = 100;

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

function getLimit(pathname: string): number {
  for (const [prefix, limit] of LIMITS) {
    if (pathname.startsWith(prefix)) return limit;
  }
  return DEFAULT_LIMIT;
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export function middleware(request: NextRequest) {
  if (store.size > 10_000) cleanup();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const pathname = request.nextUrl.pathname;
  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const limit = getLimit(pathname);

  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
