'use client';

import { useEffect, useRef } from 'react';
import { installQuizExitGuard, QUIZ_GUARD_KEY } from '../client/quiz-exit-guard';
import { installPullToRefreshGuard } from '../client/pull-to-refresh-guard';

export function useQuizExitGuard(active: boolean, message: string) {
  const messageRef = useRef(message);
  const installed = useRef(false);
  const removed = useRef(false);
  useEffect(() => { messageRef.current = message; }, [message]);
  useEffect(() => {
    if (!active) return;
    installed.current = true;
    removed.current = false;
    const dispose = installQuizExitGuard(window, () => messageRef.current);
    const disposeTouchGuard = installPullToRefreshGuard(document);
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    return () => { dispose(); disposeTouchGuard(); root.style.overscrollBehaviorY = previous; };
  }, [active]);
  useEffect(() => {
    // Remove the duplicate entry only after completion, never during Strict
    // Mode cleanup or before the first question has loaded.
    if (!active && installed.current && !removed.current && window.history.state?.[QUIZ_GUARD_KEY] === window.location.href) {
      removed.current = true;
      window.history.back();
    }
  }, [active]);
}
