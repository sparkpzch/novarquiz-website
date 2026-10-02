'use client';

import { useEffect, useState } from 'react';
import type { PersonalHistoryReport } from '../analytics/history';

/** Shared freshness policy for Home and Stats: bounded generation polling,
 * slower review polling, and refresh when returning to the visible page. */
export function usePersonalRecapReport(uid: string | null, sessionId: string | null, locale: 'en' | 'th', version = 0) {
  const key = `${uid}:${sessionId}:${locale}:${version}`;
  const [result, setResult] = useState<{ key: string; data: PersonalHistoryReport | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!uid || !sessionId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let refreshQueued = false;
    let started = Date.now();
    async function load() {
      if (inFlight || abort.signal.aborted) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(uid!)}/history?session=${encodeURIComponent(sessionId!)}&locale=${locale}`, { cache: 'no-store', signal: abort.signal });
        if (!response.ok) throw new Error('Recap unavailable');
        const data: PersonalHistoryReport = await response.json();
        if (abort.signal.aborted) return;
        setResult({ key, data, error: false });
        if (data.insightState === 'generating' && Date.now() - started < 120_000) timer = setTimeout(poll, 5_000);
        else if (data.insightState === 'pending' || data.insightState === 'approved') timer = setTimeout(poll, 30_000);
      } catch {
        if (!abort.signal.aborted) setResult({ key, data: null, error: true });
      } finally {
        inFlight = false;
        if (refreshQueued && !abort.signal.aborted) {
          refreshQueued = false;
          void load();
        }
      }
    }
    function poll() {
      if (document.visibilityState === 'visible') void load();
    }
    function resume() {
      if (document.visibilityState === 'visible') {
        started = Date.now();
        if (inFlight) refreshQueued = true;
        else void load();
      }
    }
    void load();
    window.addEventListener('focus', resume);
    window.addEventListener('novarquiz:consent-updated', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      abort.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('novarquiz:consent-updated', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [uid, sessionId, locale, version, key]);
  return result?.key === key ? result : null;
}
