'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type VideoHTMLAttributes,
} from 'react';

import { getVideoSourceType } from '@/lib/video/source';
import { attachVideoSource } from '@/lib/video/playback';
export { getVideoSourceType } from '@/lib/video/source';

type AutoPlayVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'children'> & {
  src: string;
  sourceType?: string;
  onAutoplayBlocked?: () => void;
};


export default function AutoPlayVideo({
  src,
  sourceType = getVideoSourceType(src),
  autoPlay = true,
  muted = true,
  playsInline = true,
  preload = 'auto',
  onLoadedMetadata,
  onLoadedData,
  onCanPlay,
  onAutoplayBlocked,
  ...props
}: AutoPlayVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shouldMute = autoPlay ? true : muted;

  const prepareForInlineAutoplay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = shouldMute;
    video.defaultMuted = shouldMute;
    video.playsInline = playsInline;
    video.autoplay = autoPlay;

    if (shouldMute) video.setAttribute('muted', '');
    if (playsInline) {
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    }
  }, [autoPlay, playsInline, shouldMute]);

  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !autoPlay) return;

    prepareForInlineAutoplay();
    const playAttempt = video.play();
    if (playAttempt !== undefined) {
      playAttempt.catch(() => onAutoplayBlocked?.());
    }
  }, [autoPlay, onAutoplayBlocked, prepareForInlineAutoplay]);

  useEffect(() => {
    prepareForInlineAutoplay();
    const video = videoRef.current;
    if (!video) return;
    const dispose = attachVideoSource(video, src, sourceType);
    const frame = window.requestAnimationFrame(attemptPlay);
    return () => { window.cancelAnimationFrame(frame); dispose(); };
  }, [attemptPlay, prepareForInlineAutoplay, src, sourceType]);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>['onLoadedMetadata'] = (event) => {
    onLoadedMetadata?.(event);
    attemptPlay();
  };

  const handleLoadedData: VideoHTMLAttributes<HTMLVideoElement>['onLoadedData'] = (event) => {
    onLoadedData?.(event);
    attemptPlay();
  };

  const handleCanPlay: VideoHTMLAttributes<HTMLVideoElement>['onCanPlay'] = (event) => {
    onCanPlay?.(event);
    attemptPlay();
  };

  return (
    <video
      ref={videoRef}
      autoPlay={autoPlay}
      muted={shouldMute}
      playsInline={playsInline}
      preload={preload}
      onLoadedMetadata={handleLoadedMetadata}
      onLoadedData={handleLoadedData}
      onCanPlay={handleCanPlay}
      {...props}
    />
  );
}
