'use client';

import { useEffect, useRef } from 'react';
import AutoPlayVideo from './AutoPlayVideo';

function showPreparedVideo(video: HTMLVideoElement, container: HTMLDivElement, onError?: () => void) {
  video.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;';
  video.controls = true;
  video.loop = true;
  video.onloadeddata = null;
  video.onerror = () => onError?.();
  container.appendChild(video);
  if (video.error) onError?.();
  void video.play().catch(() => {});
  return () => {
    video.pause();
    video.onerror = null;
    video.remove();
  };
}

type QuestionMediaPlayerProps = {
  src: string;
  preload: 'auto' | 'metadata';
  poster?: string;
  onError?: () => void;
  preparedVideo?: HTMLVideoElement | null;
};

export default function QuestionMediaPlayer({
  src,
  preload,
  poster,
  onError,
  preparedVideo,
}: QuestionMediaPlayerProps) {
  const preparedContainer = useRef<HTMLDivElement>(null);
  const errorHandlerRef = useRef(onError);
  useEffect(() => { errorHandlerRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!preparedVideo || !preparedContainer.current) return;
    return showPreparedVideo(preparedVideo, preparedContainer.current, () => errorHandlerRef.current?.());
  }, [preparedVideo]);

  return (
    <div className="nq-question-player h-44 w-full md:h-56">
      {preparedVideo ? <div ref={preparedContainer} className="h-full w-full" /> : <AutoPlayVideo
        key={src}
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        controls
        autoPlay
        loop
        muted
        playsInline
        preload={preload}
        poster={poster}
        onError={onError}
      />}
    </div>
  );
}
