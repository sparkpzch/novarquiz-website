export function getVideoSourceType(src: string): string | undefined {
  let path = src.split(/[?#]/)[0]?.toLowerCase() ?? '';
  try { path = decodeURIComponent(path); } catch { /* Keep malformed URLs unchanged. */ }
  if (path.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (path.endsWith('.mp4') || path.endsWith('.m4v')) return 'video/mp4';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.ogg') || path.endsWith('.ogv')) return 'video/ogg';
  if (path.endsWith('.mov')) return 'video/quicktime';
  return undefined;
}

/** Only our generated HLS assets have a predictable MP4 sibling. */
export function getManagedVideoFallback(src: string): string | null {
  try {
    const url = new URL(src);
    if (!['storage.googleapis.com', 'firebasestorage.googleapis.com'].includes(url.hostname) || !/\/processed\/[a-f0-9-]+\/master\.m3u8$/.test(decodeURIComponent(url.pathname))) return null;
    url.pathname = url.pathname.replace(/master\.m3u8$/, 'fallback.mp4');
    return url.href;
  } catch { return null; }
}


/** Native HLS startup has extra playlist round trips; short clips use progressive
 * faststart MP4. Longer native streams and MSE clients retain adaptive HLS. */
export function getShortNativeVideoSource(src: string): string | null {
  try {
    const duration = Number(new URL(src).hash.match(/^#duration=([\d.]+)$/)?.[1]);
    return duration > 0 && duration <= 10 ? getManagedVideoFallback(src) : null;
  } catch { return null; }
}
