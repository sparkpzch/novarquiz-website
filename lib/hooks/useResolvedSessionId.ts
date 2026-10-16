'use client';

import { useEffect, useState } from 'react';

/** Public quiz links carry the quiz id; the sessions API maps it server-side to
 * the quiz's public session row. Any other id (or a failed lookup) is used as-is.
 * Returns null without an id and undefined while the lookup is pending. */
export function useResolvedSessionId(id: string | null) {
  const [resolved, setResolved] = useState<{ id: string; sessionId: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/sessions/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(session => setResolved({ id, sessionId: typeof session?.id === 'string' ? session.id : id }))
      .catch(error => { if (error.name !== 'AbortError') setResolved({ id, sessionId: id }); });
    return () => controller.abort();
  }, [id]);
  if (!id) return null;
  return resolved?.id === id ? resolved.sessionId : undefined;
}
