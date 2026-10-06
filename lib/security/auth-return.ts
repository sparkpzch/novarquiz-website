import { safeRedirectPath } from './redirect';
export const AUTH_RETURN_KEY = 'novarquiz-auth-return';

export function authReturnPath(value: string | null, fallback = '/') {
  const path = safeRedirectPath(value, fallback);
  return /^\/(sign-in|sign-up|forgot-password|new-password)(?:[/?#]|$)/.test(path) ? fallback : path;
}
export function authHref(route: string, destination: string) {
  const next = authReturnPath(destination);
  return next === '/' ? route : `${route}?next=${encodeURIComponent(next)}`;
}
