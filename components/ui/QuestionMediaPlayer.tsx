'use client';

import AutoPlayVideo from './AutoPlayVideo';

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
      <AutoPlayVideo
        key={src}
        src={src}
        controls
        autoPlay
        loop
        muted
        playsInline
        preload={preload}
        poster={poster}
        onError={onError}
      />
    </div>
  );
}
