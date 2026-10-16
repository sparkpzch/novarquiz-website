'use client';

import { createContext, useContext } from 'react';

// The play-session row behind a /play/[sessionId] URL. Public quizzes put the
// quiz id in the URL; the play layout resolves it once so realtime rooms,
// lobby connections and play APIs all stay on the existing session row.
export const PlaySessionContext = createContext<string | null>(null);

export function usePlaySessionId(routeId: string) {
  return useContext(PlaySessionContext) ?? routeId;
}
