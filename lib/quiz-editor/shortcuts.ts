export type CanvasShortcut = 'fit' | 'reset' | 'zoomIn' | 'zoomOut';

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>;

/**
 * Maps a keydown to a Figma-style canvas action, or null.
 * Shift+1 fit · Shift+0 / Mod+0 100% · Mod+= / Mod+- zoom (Mod = ⌘ or Ctrl).
 * Uses `code` for the Shift combos: Shift+1 reports key "!" (and varies by layout).
 */
export function canvasShortcut(e: KeyLike): CanvasShortcut | null {
  if (e.altKey) return null;
  const mod = e.metaKey || e.ctrlKey;
  if (e.shiftKey && !mod) {
    if (e.code === 'Digit1') return 'fit';
    if (e.code === 'Digit0') return 'reset';
    return null;
  }
  if (!mod) return null;
  if (e.key === '=' || e.key === '+') return 'zoomIn';
  if (e.key === '-' || e.key === '_') return 'zoomOut';
  if (e.key === '0') return 'reset';
  return null;
}
