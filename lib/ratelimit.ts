import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const WINDOW = '60 s';
const WINDOW_MS = 60_000;

// Route-specific limits (requests per window). First match wins.
const ROUTE_LIMITS: Array<[string, number]> = [
  ['/api/auth/session', 10],
  ['/api/auth/rehydrate', 5],
  ['/api/upload', 5],
  ['/api/join', 20],
  ['/api/play', 60],
];
const DEFAULT_LIMIT = 100;

function resolveLimit(pathname: string): number {
  for (const [prefix, limit] of ROUTE_LIMITS) {
    if (pathname.startsWith(prefix)) return limit;
  }
  return DEFAULT_LIMIT;
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

function fallbackCheck(key: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (fallbackStore.size > 10_000) {
    for (const [k, e] of fallbackStore) {
      if (e.resetAt < now) fallbackStore.delete(k);
    }
  }
  const entry = fallbackStore.get(key);
  if (!entry || entry.resetAt < now) {
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

export async function checkRateLimit(
  ip: string,
  pathname: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const limit = resolveLimit(pathname);
  const key = `${ip}:${pathname}`;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { success, reset } = await getLimiter(limit).limit(key);
      return {
        allowed: success,
        retryAfter: success ? 0 : Math.ceil((reset - Date.now()) / 1000),
      };
    } catch {
      // Redis unavailable — degrade gracefully to in-process fallback
    }
  }

  return fallbackCheck(key, limit);
}
