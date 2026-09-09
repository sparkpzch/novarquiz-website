// Presence expires when a play tab stops sending its 30-second heartbeat.
export const SESSION_PRESENCE_TTL_MS = 90_000;

export function hasRecentSessionPresence(
  entry: { joinedAt: number; lastActiveAt?: number },
  now: number,
): boolean {
  const timestamp = entry.lastActiveAt ?? entry.joinedAt;
  return Number.isFinite(timestamp) && timestamp <= now + 30_000 && now - timestamp < SESSION_PRESENCE_TTL_MS;
}

export function canResumeRoom(
  room: { status: string; players?: Record<string, unknown>; scores?: Record<string, { finished?: boolean }> } | null,
  uid: string,
): boolean {
  return !!room && (room.status === 'waiting' || room.status === 'started') &&
    !!room.players?.[uid] && !room.scores?.[uid]?.finished;
}
