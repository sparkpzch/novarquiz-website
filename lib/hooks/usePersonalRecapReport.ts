'use client';

import { useEffect, useState } from 'react';
import type { PersonalHistoryReport } from '../analytics/history';
import { createRequestFreshness } from '../client/request-freshness';
import { recapPollDelay } from '../client/recap-polling';

/** Focus refresh uses 30-second freshness; generation/review polling and
 * explicit consent changes can still refresh immediately. */
export function usePersonalRecapReport(uid: string | null, sessionId: string | null, locale: 'en' | 'th', version = 0) {
  const key = `${uid}:${sessionId}:${locale}:${version}`;
  const [result, setResult] = useState<{ key: string; data: PersonalHistoryReport | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!uid || !sessionId) return;
    const abort = new AbortController();
    const freshness = createRequestFreshness();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshQueued = false;
    let started = Date.now();
    let latest: PersonalHistoryReport | null = null;

    function schedulePoll() {
      clearTimeout(timer);
      timer = undefined;
      const delay = recapPollDelay(latest?.insightState, Date.now() - started, document.visibilityState === 'visible');
      if (delay !== null) timer = setTimeout(poll, delay);
    }
    async function load(force = false, restartWindow = false) {
      if (abort.signal.aborted || !freshness.start(force)) return;
      if (restartWindow) started = Date.now();
      clearTimeout(timer);
      timer = undefined;
      let success = false;
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(uid!)}/history?session=${encodeURIComponent(sessionId!)}&locale=${locale}`, { cache: 'no-store', signal: abort.signal });
        if (!response.ok) throw new Error('Recap unavailable');
        const data: PersonalHistoryReport = await response.json();
        if (abort.signal.aborted) return;
        latest = data;
        success = true;
        setResult({ key, data, error: false });
      } catch {
        latest = null;
        if (!abort.signal.aborted) setResult({ key, data: null, error: true });
      } finally {
        freshness.finish(success);
        if (!abort.signal.aborted) {
          if (refreshQueued) {
            refreshQueued = false;
            void load(true, true);
          } else schedulePoll();
        }
      }
    }
    function poll() {
      timer = undefined;
      if (document.visibilityState === 'visible') void load(true);
    }
    function resume() {
      if (document.visibilityState !== 'visible') return;
      // Paired focus/visibility events never queue a second request.
      void load(false, true);
      // A polling timer may have expired while hidden. Restore it even if
      // the previous result is still fresh enough to skip a focus request.
      if (!freshness.pending && timer === undefined) schedulePoll();
    }
    function consentUpdated() {
      // Consent changes invalidate data even if a request is already running.
      if (freshness.pending) refreshQueued = true;
      else void load(true, true);
    }
    void load();
    window.addEventListener('focus', resume);
    window.addEventListener('novarquiz:consent-updated', consentUpdated);
    document.addEventListener('visibilitychange', resume);
    return () => {
      abort.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('novarquiz:consent-updated', consentUpdated);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [uid, sessionId, locale, version, key]);
  return result?.key === key ? result : null;
}
