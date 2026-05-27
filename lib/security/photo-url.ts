// Photo URLs are rendered as <img src> by other players in the same room.
// z.string().url() alone accepts any scheme/host, which lets an attacker plant
// a tracking URL (or worse: a mixed-content reference) that everyone in the
// lobby will fetch. Restrict to a known set of trusted profile-photo origins.

const TRUSTED_PHOTO_ORIGINS = new Set<string>([
  'lh3.googleusercontent.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== 'https:') return null;
    return TRUSTED_PHOTO_ORIGINS.has(hostname) ? raw : null;
  } catch {
    return null;
  }
}
