/** Safari can ignore root overscroll-behavior, including on short pages. */
export function installPullToRefreshGuard(doc: Document) {
  let previous: { x: number; y: number } | null = null;
  let origin: { x: number; y: number } | null = null;
  const reset = () => { previous = null; origin = null; };
  const start = (event: TouchEvent) => {
    if (event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    previous = origin = { x: touch.clientX, y: touch.clientY };
  };
  const move = (event: TouchEvent) => {
    if (!previous || !origin || event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    const downward = touch.clientY > previous.y;
    previous = { x: touch.clientX, y: touch.clientY };
    // Leave pinch zoom, horizontal controls and ordinary upward scrolling alone.
    if (!downward || Math.abs(touch.clientX - origin.x) >= Math.abs(touch.clientY - origin.y)) return;
    const root = doc.scrollingElement ?? doc.documentElement;
    if (root.scrollTop > 0 || !event.cancelable) return;
    // A dialog/list can still scroll toward its own top when the page is at 0.
    for (const target of event.composedPath()) {
      if (target === root || target === doc) break;
      if (!(target instanceof doc.defaultView!.HTMLElement)) continue;
      const overflow = doc.defaultView!.getComputedStyle(target).overflowY;
      if (/^(auto|scroll|overlay)$/.test(overflow) && target.scrollHeight > target.clientHeight && target.scrollTop > 0) return;
    }
    event.preventDefault();
  };
  const passive = { capture: true, passive: true };
  const blocking = { capture: true, passive: false };
  doc.addEventListener('touchstart', start, passive);
  doc.addEventListener('touchmove', move, blocking);
  doc.addEventListener('touchend', reset, passive);
  doc.addEventListener('touchcancel', reset, passive);
  return () => {
    doc.removeEventListener('touchstart', start, passive);
    doc.removeEventListener('touchmove', move, blocking);
    doc.removeEventListener('touchend', reset, passive);
    doc.removeEventListener('touchcancel', reset, passive);
  };
}
