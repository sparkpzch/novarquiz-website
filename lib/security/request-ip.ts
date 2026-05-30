// Per CLAUDE.md invariant: x-forwarded-for / x-real-ip are only trusted when
// the operator opts in via TRUST_PROXY. Otherwise an attacker can spoof the
// header to evade per-IP rate limits. When proxy headers are not trusted we
// fall back to a single shared bucket key so the per-route cap still applies
// globally instead of being silently disabled.

const FALLBACK_KEY = 'untrusted';

export function getRateLimitIp(request: Request): string {
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      const last = xff.split(',').at(-1)?.trim();
      if (last) return last;
    }
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return FALLBACK_KEY;
}
