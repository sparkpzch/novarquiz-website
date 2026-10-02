import type { LeaderboardEntry } from '../types';

/** Completed results are authoritative. Live Firebase IDs are intentionally
 * different from the pseudonymous IDs returned by the public standings API;
 * merging the two can duplicate players and change their final scores. */
export function rankLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) =>
    b.total_score - a.total_score || a.total_time_ms - b.total_time_ms ||
    (a.user_display_name || '').localeCompare(b.user_display_name || '') || a.user_id.localeCompare(b.user_id),
  );
}

export function formatQuizTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
