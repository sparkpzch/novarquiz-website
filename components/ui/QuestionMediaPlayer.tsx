'use client';

import ReactPlayer from 'react-player';

type QuestionMediaPlayerProps = {
  src: string;
  preload: 'auto' | 'metadata';
  poster?: string;
  onError?: () => void;
};

export default function QuestionMediaPlayer({
  src,
  preload,
  poster,
  onError,
}: QuestionMediaPlayerProps) {
  return (
    <div className="nq-question-player h-44 w-full md:h-56">
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
    </div>
  );
}
