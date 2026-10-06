'use client';
/* eslint-disable react-hooks/immutability -- preparedVideo is an intentionally transferred DOM media element, not React data. */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import AutoPlayVideo from './AutoPlayVideo';
import { getManagedVideoFallback } from '@/lib/video/source';

type Props = { src: string; preload: 'auto' | 'metadata'; poster?: string; onError?: () => void; preparedVideo?: HTMLVideoElement | null };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export default function QuestionMediaPlayer({ src, preload, poster, onError, preparedVideo }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const errorRef = useRef(onError);
  const [state, setState] = useState({ playing: false, muted: true, current: 0, duration: 0, ratio: 16 / 9 });
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  const currentVideo = () => frame.current?.querySelector('video');
  const fail = useCallback(() => {
    const mp4 = getManagedVideoFallback(src);
    if (mp4 && !fallback) setFallback(mp4);
    else errorRef.current?.();
  }, [src, fallback]);
  useEffect(() => {
    if (!frame.current) return;
    if (preparedVideo && !fallback) {
      preparedVideo.controls = false;
      preparedVideo.loop = true;
      preparedVideo.removeAttribute('aria-hidden');
      preparedVideo.removeAttribute('tabindex');
      preparedVideo.onloadeddata = null;
      preparedVideo.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
      frame.current.appendChild(preparedVideo);
    }
    const video = currentVideo();
    if (!video) return;
    const update = () => setState({ playing: !video.paused, muted: video.muted, current: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0, ratio: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9 });
    const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'volumechange'];
    events.forEach(event => video.addEventListener(event, update));
    video.addEventListener('error', fail);
    update();
    if (preparedVideo && !fallback) void video.play().catch(() => {});
    return () => {
      events.forEach(event => video.removeEventListener(event, update));
      video.removeEventListener('error', fail);
      if (preparedVideo && !fallback) { video.pause(); video.remove(); }
    };
  }, [preparedVideo, fallback, src, fail]);
  return <div className="nq-question-player" style={{ '--nq-video-ratio': state.ratio } as CSSProperties}>
    <div className="nq-video-frame" ref={frame}>
      {(!preparedVideo || fallback) && <AutoPlayVideo key={fallback ?? src} src={fallback ?? src} autoPlay loop muted playsInline
        preload={preload} poster={poster} aria-label="Quiz video" />}
    </div>
    <div className="nq-video-controls" role="group" aria-label="Video controls">
      <button type="button" aria-label={state.playing ? 'Pause video' : 'Play video'} onClick={() => {
        const video = currentVideo(); if (video?.paused) void video.play().catch(() => {}); else video?.pause();
      }}>{state.playing ? '❚❚' : '▶'}</button>
      <input type="range" aria-label="Video position" min={0} max={state.duration || 1} step={0.1} value={Math.min(state.current, state.duration || 1)}
        disabled={!state.duration} onChange={event => { const video = currentVideo(); if (video) video.currentTime = Number(event.target.value); }} />
      <span className="nq-video-time" aria-label="Video time">{time(state.current)} / {time(state.duration)}</span>
      <button type="button" aria-label={state.muted ? 'Unmute video' : 'Mute video'} onClick={() => {
        const video = currentVideo(); if (video) video.muted = !video.muted;
      }}>{state.muted ? '♪̸' : '♪'}</button>
      <button type="button" aria-label="Full screen video" onClick={() => {
        const video = currentVideo() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (video?.requestFullscreen) void video.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
        else video?.webkitEnterFullscreen?.();
      }}>⛶</button>
    </div>
  </div>;
}
