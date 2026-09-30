import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const WINDOW = '60 s';
const WINDOW_MS = 60_000;

// Route-specific limits (requests per window). First match wins.
const ROUTE_LIMITS: Array<[string, number]> = [
  ['/api/auth/session', 10],
  ['/api/auth/rehydrate', 5],
  ['/api/auth/consent', 10],   // L1: consent writes are low-frequency by design
  ['/api/upload', 5],
  ['/api/join', 20],
  ['/api/play', 60],
  ['/api/account', 5],         // L2: destructive — conservative cap on deletion attempts
  // Each call spends Gemini free-tier quota. Must stay above the '/api/admin'
  // entry below it — first match wins.
  ['/api/admin/insight-templates/draft', 5],
  // Admin analytics routes can process many player rows — conservative limit to
  // bound bulk-scraping of pseudonymous behavioral data.
  ['/api/admin', 20],
];
const DEFAULT_LIMIT = 100;
const STATIC_BUCKETS = new Set([
  '/api/quizzes', '/api/sessions', '/api/auth/admin', '/api/admin/stats',
  '/api/admin/insight-templates', '/api/admin/provisional-insights',
  '/api/admin/sessions/compare',
]);

function resolveLimit(pathname: string): number {
  for (const [prefix, limit] of ROUTE_LIMITS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return limit;
  }
  return DEFAULT_LIMIT;
}

// IDs must not create new counters. Preserve the operation suffix so normal
// answer/leaderboard traffic retains separate limits, as it did previously.
function routeBucket(pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  if (STATIC_BUCKETS.has(path)) return path;
  const dynamic = /^(\/api\/(?:admin\/)?(?:quizzes|sessions|users|play|team-rooms|join))\/[^/]+(\/(?:analytics|answer|complete|leaderboard|preview|join|duplicate|graph|data|history|health-stats))?$/.exec(path);
  if (dynamic) return `${dynamic[1]}/:id${dynamic[2] ?? ''}`;
  for (const [prefix] of ROUTE_LIMITS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return prefix;
  }
  // Arbitrary unknown namespaces must not allocate unlimited memory either.
  return '/api/:unknown';
}

// ── Upstash Redis path ──────────────────────────────────────────────────────
// One Redis client and one Ratelimit instance per distinct limit value,
// lazily initialised and cached for the lifetime of the Edge worker.

let redis: Redis | null = null;
const limiterByCount = new Map<number, Ratelimit>();

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      // The SDK defaults to 5 retries with Math.exp(n) * 50 backoff, i.e.
      // ~4.3s before it gives up. A rate limiter sits in front of every /api
      // request, so an unreachable Redis added ~4.3s to each one. One quick
      // retry is all this is worth: the fallback below is right there.
      retry: { retries: 1, backoff: () => 50 },
    });
  }
  return redis;
}

function getLimiter(limit: number): Ratelimit {
  if (!limiterByCount.has(limit)) {
    limiterByCount.set(
      limit,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(limit, WINDOW),
        prefix: 'nq_rl',
      }),
    );
  }
  return limiterByCount.get(limit)!;
}

// ── In-process fallback (dev / Redis not configured) ───────────────────────
// Per-instance only — same behaviour as the original Map store.
// Kept so the app works without UPSTASH_* env vars in local dev.

type Entry = { count: number; resetAt: number };
const fallbackStore = new Map<string, Entry>();

// Falling back is a security regression, not a nicety: each instance keeps its
// own counter, so with maxInstances > 1 the effective limit is multiplied, and
// minInstances: 0 resets every counter on each cold start. Nothing surfaced
// that before, which is why a deleted Redis went unnoticed. Warn once per
// instance — enough to show up in logs without one line per request.
let warnedFallback = false;

// Even one quick retry costs every request while Redis is down. Trip a breaker
// on failure so an outage costs one slow request per cooldown rather than one
// per request; the fallback keeps enforcing limits meanwhile.
const BREAKER_COOLDOWN_MS = 30_000;
let redisDownUntil = 0;

function warnFallback(reason: string) {
  if (warnedFallback) return;
  warnedFallback = true;
  const message =
    `[ratelimit] using in-process fallback (${reason}) — ` +
    'limits are per-instance and reset on cold start';
  if (process.env.NODE_ENV === 'production') console.error(message);
  else console.warn(message);
}

function fallbackCheck(key: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (fallbackStore.size > 10_000) {
    for (const [k, e] of fallbackStore) {
      if (e.resetAt <= now) fallbackStore.delete(k);
    }
  }
  const entry = fallbackStore.get(key);
  if (!entry || entry.resetAt <= now) {
    fallbackStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key and route pathname.
 *
 * @param ip - The rate-limit identity key. For unauthenticated routes pass
 *   the client IP. For authenticated routes pass `uid:<userId>` so the limit
 *   is per-user rather than per-IP (avoids shared-IP false positives and
 *   makes the key meaningful in server logs). L4: parameter named `ip` for
 *   historical reasons — it accepts any stable string key.
 * @param pathname - The route prefix used to look up the per-route limit.
 * @param scope - Keep ingress and handler counters separate to avoid counting
 * the same request twice against one budget when both layers check it.
 */
export async function checkRateLimit(
  ip: string,
  pathname: string,
  scope: 'handler' | 'ingress' = 'handler',
): Promise<{ allowed: boolean; retryAfter: number }> {
  const limit = resolveLimit(pathname);
  const key = `${scope}:${ip}:${routeBucket(pathname)}`;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (Date.now() >= redisDownUntil) {
      try {
        const { success, reset } = await getLimiter(limit).limit(key);
        redisDownUntil = 0;
        return {
          allowed: success,
          retryAfter: success ? 0 : Math.ceil((reset - Date.now()) / 1000),
        };
      } catch {
        // Redis unavailable — degrade gracefully to in-process fallback.
        // Reason only; the error can carry the configured REST URL.
        redisDownUntil = Date.now() + BREAKER_COOLDOWN_MS;
        warnFallback('Redis request failed');
      }
    }
  } else {
    warnFallback('UPSTASH_REDIS_REST_URL/TOKEN not set');
  }

  return fallbackCheck(key, limit);
}
