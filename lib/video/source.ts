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
