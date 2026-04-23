// Firebase Analytics — client-only, no-op on server / when unsupported.
//
// Tracks the full quiz-session funnel:
//   session_lobby_opened → session_join_attempted → session_join_succeeded
//   → session_started → question_viewed → choice_selected
//   → (session_completed | session_abandoned | question_timeout)
//
// Safe to call from anywhere: if the runtime isn't a browser or the
// measurement id is missing, `trackEvent` silently drops the event.

import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';
import app from './config';

let analyticsPromise: Promise<Analytics | null> | null = null;

function getAnalyticsSafe(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return Promise.resolve(null);
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = isSupported()
    .then(ok => (ok ? getAnalytics(app) : null))
    .catch(() => null);
  return analyticsPromise;
}

export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  // Fire-and-forget — callers shouldn't have to await analytics.
  getAnalyticsSafe().then(a => {
    if (!a) return;
    try {
      logEvent(a, eventName, params);
    } catch {
      /* swallow — analytics must never break the app */
    }
  });
}
