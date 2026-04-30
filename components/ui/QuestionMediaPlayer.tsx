'use client';

import ReactPlayer from 'react-player';
import MuxPlayer from '@mux/mux-player-react';

type QuestionMediaPlayerProps = {
  src: string;
  preload: 'auto' | 'metadata';
  poster?: string;
  muxPlaybackId?: string | null;
  onError?: () => void;
};

export default function QuestionMediaPlayer({
  src,
  preload,
  poster,
  muxPlaybackId,
  onError,
}: QuestionMediaPlayerProps) {
  return (
    <div className="nq-question-player h-44 w-full md:h-56">
      {muxPlaybackId ? (
        <MuxPlayer
          key={muxPlaybackId}
          playbackId={muxPlaybackId}
          accentColor="#4f82e8"
          autoPlay
          loop
          muted
          playsInline
          preload={preload}
          poster={poster}
          style={{ width: '100%', height: '100%' }}
          onError={onError}
        />
      ) : (
        <ReactPlayer
          key={src}
          src={src}
          controls
          playing
          loop
          muted
          playsInline
          preload={preload}
          poster={poster}
          width="100%"
          height="100%"
          onError={onError}
        />
      )}
    </div>
  );
}
