const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// SameSite cookies alone do not protect against sibling origins or login CSRF.
export function isTrustedMutation(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  const source = origin ?? request.headers.get('referer');
  if (!source || source === 'null') return false;
  try {
    const url = new URL(source);
    if (url.username || url.password) return false;
    // Origin must be a serialized origin, never a URL with an arbitrary path.
    if (origin && source !== url.origin) return false;
    // App Hosting can expose an internal Cloud Run URL here. Use an explicit
    // public origin behind the proxy; never derive trust from forwarded headers.
    const configuredOrigin = process.env.APP_ORIGIN;
    const expectedOrigin = configuredOrigin || new URL(request.url).origin;
    const expected = new URL(expectedOrigin);
    if (expectedOrigin !== expected.origin) return false;
    return url.origin === expected.origin;
  } catch {
    return false;
  }
}
