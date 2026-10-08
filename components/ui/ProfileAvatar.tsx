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
  const [failedPhotoURL, setFailedPhotoURL] = useState<string | null>(null);
  const initial = (displayName?.trim()?.[0] || '?').toUpperCase();

  if (photoURL && photoURL !== failedPhotoURL) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-full bg-white/40 ${ringClassName} ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={photoURL}
          alt={displayName || 'Profile'}
          className="h-full w-full object-cover"
          onError={() => setFailedPhotoURL(photoURL)}
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center justify-center rounded-full bg-[var(--nq-primary)] font-bold text-white ${ringClassName} ${className} ${textClassName}`}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.34) }}
    >
      {initial}
    </div>
  );
}
