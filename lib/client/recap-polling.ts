import type { PersonalInsightState } from '../analytics/history';

/** Slow down long-running work without abandoning recovery after a refresh. */
export function recapPollDelay(state: PersonalInsightState | undefined, elapsedMs: number, visible: boolean): number | null {
  if (!visible || state === 'standard' || state === 'consent-required') return null;
  if (state === 'generating' && elapsedMs < 120_000) return 5_000;
  // Missing data can mean a transient request/provider failure. Keep checking
  // so the server can reclaim interrupted or failed generation leases.
  return 30_000;
}
