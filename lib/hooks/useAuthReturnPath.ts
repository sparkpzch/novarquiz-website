'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { authReturnPath, AUTH_RETURN_KEY } from '../security/auth-return';

const RETURN_CHANGED = 'novarquiz:auth-return-changed';
function readSaved() {
  try { return authReturnPath(sessionStorage.getItem(AUTH_RETURN_KEY)); } catch { return '/'; }
}
function subscribe(changed: () => void) {
  window.addEventListener(RETURN_CHANGED, changed);
  window.addEventListener('storage', changed);
  return () => { window.removeEventListener(RETURN_CHANGED, changed); window.removeEventListener('storage', changed); };
}
export function useAuthReturnPath() {
  const requested = useSearchParams().get('next');
  const saved = useSyncExternalStore(subscribe, readSaved, () => '/');
  useEffect(() => {
    if (!requested || authReturnPath(requested) === '/') return;
    try {
      sessionStorage.setItem(AUTH_RETURN_KEY, authReturnPath(requested));
      window.dispatchEvent(new Event(RETURN_CHANGED));
    } catch { /* The URL still preserves the destination when storage is blocked. */ }
  }, [requested]);
  return authReturnPath(requested, requested ? '/' : saved);
}
export function clearAuthReturnPath() {
  try {
    sessionStorage.removeItem(AUTH_RETURN_KEY);
    window.dispatchEvent(new Event(RETURN_CHANGED));
  } catch {}
}
