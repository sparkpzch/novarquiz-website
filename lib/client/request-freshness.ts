export const FOCUS_FRESHNESS_MS = 30_000;

/** Per-consumer freshness; no personal data is shared or persisted. */
export function createRequestFreshness(freshForMs = FOCUS_FRESHNESS_MS, now = Date.now) {
  let pending = false;
  let freshUntil = 0;
  return {
    get pending() { return pending; },
    start(force = false) {
      if (pending || (!force && now() < freshUntil)) return false;
      pending = true;
      return true;
    },
    finish(success: boolean) {
      pending = false;
      freshUntil = success ? now() + freshForMs : 0;
    },
  };
}
