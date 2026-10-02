export type GameHistoryScore = {
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  rank?: number;
};

export type GameStatsSummary = {
  totalPlayed: number;
  bestScore: number;
  avgScore: number;
  bestStreak: number;
  totalCorrect: number;
  accuracy: number;
  topRank: number | null;
};

/** Personal game aggregates; individual run scores retain their penalties. */
export function summarizeGameStats(history: GameHistoryScore[]): GameStatsSummary {
  const totalPlayed = history.length;
  // Personal best starts at zero; individual runs can still carry penalties.
  const bestScore = Math.max(0, ...history.map((entry) => entry.total_score));
  const avgScore = totalPlayed
    ? Math.round(history.reduce((sum, entry) => sum + entry.total_score, 0) / totalPlayed)
    : 0;
  const bestStreak = totalPlayed ? Math.max(...history.map((entry) => entry.streak)) : 0;
  const totalCorrect = history.reduce((sum, entry) => sum + entry.correct_count, 0);
  const totalAnswered = totalCorrect + history.reduce((sum, entry) => sum + entry.incorrect_count, 0);
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const ranked = history
    .map((entry) => entry.rank)
    .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));

  return {
    totalPlayed,
    bestScore,
    avgScore,
    bestStreak,
    totalCorrect,
    accuracy,
    topRank: ranked.length ? Math.min(...ranked) : null,
  };
}
