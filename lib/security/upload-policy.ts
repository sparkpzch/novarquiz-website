export const MIB = 1024 * 1024;
export const UPLOAD_LIMITS = { dailyBytes: 500 * MIB, dailyFiles: 50, dailyVideoJobs: 10,
  storageBytes: 2 * 1024 * MIB, videoOutputBytes: 150 * MIB };
export type UploadUsage = { day: string; dailyBytes: number; dailyFiles: number; dailyVideoJobs: number; dailyVideoUploads?: number; storageBytes: number; settled?: Record<string, boolean> };

export function chargeUpload(current: UploadUsage | null, day: string, size: number, video: boolean) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 50 * MIB) return null;
  const usage = current?.day === day ? current : { ...current, day, dailyBytes: 0, dailyFiles: 0, dailyVideoJobs: 0, dailyVideoUploads: 0, storageBytes: current?.storageBytes ?? 0 };
  const next = { ...usage, dailyBytes: usage.dailyBytes + size, dailyFiles: usage.dailyFiles + 1,
    dailyVideoJobs: usage.dailyVideoJobs, dailyVideoUploads:(usage.dailyVideoUploads ?? 0) + Number(video), storageBytes: usage.storageBytes + size + (video ? UPLOAD_LIMITS.videoOutputBytes : 0) };
  return next.dailyBytes <= UPLOAD_LIMITS.dailyBytes && next.dailyFiles <= UPLOAD_LIMITS.dailyFiles &&
    (next.dailyVideoUploads ?? 0) <= UPLOAD_LIMITS.dailyVideoJobs && (!video || usage.dailyVideoJobs < UPLOAD_LIMITS.dailyVideoJobs) && next.storageBytes <= UPLOAD_LIMITS.storageBytes ? next : null;
}

export function chargeVideoRetry(current: UploadUsage | null, day: string) {
  const usage = current?.day === day ? current : { ...current, day, dailyBytes: 0, dailyFiles: 0, dailyVideoJobs: 0, dailyVideoUploads: 0, storageBytes: current?.storageBytes ?? 0 };
  return usage.dailyVideoJobs < UPLOAD_LIMITS.dailyVideoJobs ? { ...usage, dailyVideoJobs: usage.dailyVideoJobs + 1 } : null;
}
