import type { SessionRoom } from '@/lib/firebase/rtdb';
import { hasRecentSessionPresence } from '@/lib/session-resume';

export function lobbyStandings(room: SessionRoom | null, now = Date.now()) {
  const rows = Object.entries(room?.players ?? {}).filter(([, player]) => !player.left).map(([uid, player]) => {
    const score = room?.scores?.[uid];
    const currentScore = score && (!room?.roundId || score.roundId === room.roundId) ? score : undefined;
    const transports = player.connectionId ? room?.connections?.[uid]?.[player.connectionId] : undefined;
    const connected = room?.status === 'ended' ? false : player.connectionId
      ? (Object.values(transports ?? {}).some(Boolean) && hasRecentSessionPresence(player,now)) || now - player.joinedAt < 10_000
      : true;
    return { uid, displayName: player.displayName || currentScore?.displayName || 'Player', photoURL: player.photoURL ?? currentScore?.photoURL ?? null,
      joinedAt: player.joinedAt, connected, score: Number.isFinite(currentScore?.score) ? currentScore!.score : 0,
      finished: currentScore?.finished ?? false, currentQuestionLabel: currentScore?.currentQuestionLabel ?? null };
  }).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid));
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.score !== rows[index - 1].score) rank = index + 1;
    return { ...row, rank };
  });
}
