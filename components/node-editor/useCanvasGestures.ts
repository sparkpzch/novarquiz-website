'use client';

import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { canvasShortcut } from '@/lib/quiz-editor/shortcuts';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;
const FIT_OPTIONS = { padding: 0.2, duration: 200 };

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

// Safari's non-standard pinch event (Chrome/Firefox send wheel + ctrlKey instead).
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

/**
 * Figma-style canvas controls that React Flow doesn't provide on its own:
 *  - Safari trackpad pinch-to-zoom (React Flow only understands wheel+ctrlKey,
 *    so without this Safari zooms the whole page instead of the canvas)
 *  - Shift+1 fit, Shift+0 / ⌘0 100%, ⌘+ / ⌘− zoom (Ctrl on Windows/Linux)
 * Two-finger pan and Chrome/Firefox pinch are handled by React Flow props.
 */
export function useCanvasGestures(canvasRef: RefObject<HTMLElement | null>) {
  const { getViewport, setViewport, zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof window === 'undefined' || !('GestureEvent' in window)) return;
    let startZoom = 1;
    const onStart = (e: Event) => { e.preventDefault(); startZoom = getViewport().zoom; };
    const onChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      const rect = el.getBoundingClientRect();
      const px = g.clientX - rect.left;
      const py = g.clientY - rect.top;
      const v = getViewport();
      const zoom = clampZoom(startZoom * g.scale);
      const k = zoom / v.zoom;
      // Keep the point under the cursor fixed while zooming.
      setViewport({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, zoom });
    };
    const onEnd = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', onStart, { passive: false });
    el.addEventListener('gesturechange', onChange, { passive: false });
    el.addEventListener('gestureend', onEnd, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', onStart);
      el.removeEventListener('gesturechange', onChange);
      el.removeEventListener('gestureend', onEnd);
    };
  }, [canvasRef, getViewport, setViewport]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = canvasShortcut(e);
      if (!action) return;
      // Also overrides the browser's page zoom while the editor is open, as Figma does.
      e.preventDefault();
      if (action === 'fit') void fitView(FIT_OPTIONS);
      else if (action === 'reset') void zoomTo(1, { duration: 200 });
      else if (action === 'zoomIn') void zoomIn({ duration: 150 });
      else void zoomOut({ duration: 150 });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fitView, zoomIn, zoomOut, zoomTo]);
}
