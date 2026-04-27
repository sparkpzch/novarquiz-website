'use client';

import { useState } from 'react';

type ProfileAvatarProps = {
  displayName?: string | null;
  photoURL?: string | null;
  size?: number;
  ringClassName?: string;
  className?: string;
  textClassName?: string;
};

export default function ProfileAvatar({
  displayName,
  photoURL,
  size = 48,
  ringClassName = '',
  className = '',
  textClassName = '',
}: ProfileAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (displayName?.trim()?.[0] || '?').toUpperCase();

  if (photoURL && !imgFailed) {
    return (
      <div
        className={`overflow-hidden rounded-full bg-white/40 ${ringClassName} ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={photoURL}
          alt={displayName || 'Profile'}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#92BFFF] via-[#4D92E4] to-[#055A9E] font-bold text-white ${ringClassName} ${className} ${textClassName}`}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.34) }}
    >
      {initial}
    </div>
  );
}
