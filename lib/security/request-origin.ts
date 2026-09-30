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
    return url.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
