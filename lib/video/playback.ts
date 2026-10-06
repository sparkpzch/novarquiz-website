import { getVideoSourceType, getShortNativeVideoSource } from './source';

const disposers = new WeakMap<HTMLVideoElement, () => void>();

/** Native HLS on Safari, dynamically loaded MSE player elsewhere. */
export function attachVideoSource(video: HTMLVideoElement, src: string, type = getVideoSourceType(src)) {
  const shortSource = type === 'application/vnd.apple.mpegurl' && video.canPlayType(type) ? getShortNativeVideoSource(src) : null;
  if (shortSource) { src = shortSource; type = 'video/mp4'; }
  disposeVideoSource(video);
  let cancelled = false;
  let destroyHls: (() => void) | undefined;
  const dispose = () => {
    if (cancelled) return;
    cancelled = true;
    destroyHls?.();
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (disposers.get(video) === dispose) disposers.delete(video);
  };
  disposers.set(video, dispose);

  if (type !== 'application/vnd.apple.mpegurl' || video.canPlayType(type)) {
    video.src = src;
    video.load();
  } else {
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        video.dispatchEvent(new Event('error'));
        return;
      }
      const hls = new Hls({
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
        backBufferLength: 6,
      });
      destroyHls = () => hls.destroy();
      let recoveredMedia = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
          recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        video.dispatchEvent(new Event('error'));
      });
      hls.attachMedia(video);
      hls.loadSource(src);
    }).catch(() => {
      if (!cancelled) video.dispatchEvent(new Event('error'));
    });
  }
  return dispose;
}

export function disposeVideoSource(video: HTMLVideoElement) {
  disposers.get(video)?.();
}
