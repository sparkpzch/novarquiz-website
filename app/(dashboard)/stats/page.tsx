"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { motion } from "motion/react";
import { Card } from "@/components/ui/Card";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/query/api";


type HistoryEntry = {
  session_id: string;
  session_name: string;
  session_description: string | null;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  total_time_ms: number;
  completed_at: string;
  rank: number;
  total_players: number;
};

function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-[#5D7EA1]">
        {score}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-[#0460A9]/08 h-2.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-[#0460A9] to-[#92BFFF]"
        />
      </div>
      <span className="w-8 text-xs text-[#5D7EA1]">{pct}%</span>
    </div>
  );
}

export default function StatsPage() {
  const { user } = useAuth();
  const historyQuery = useQuery({
    queryKey: ["users", user?.uid, "history"],
    queryFn: () => apiJson<HistoryEntry[]>(`/api/users/${user?.uid}/history`),
    enabled: Boolean(user?.uid && !user.isAnonymous),
  });
  const history = historyQuery.data ?? [];
  const loading = Boolean(user?.uid && !user.isAnonymous && historyQuery.isLoading);

  const totalPlayed = history.length;
  const bestScore = totalPlayed ? Math.max(...history.map((h) => h.total_score)) : 0;
  const avgScore = totalPlayed
    ? Math.round(history.reduce((sum, h) => sum + h.total_score, 0) / totalPlayed)
    : 0;
  const bestStreak = totalPlayed ? Math.max(...history.map((h) => h.streak)) : 0;
  const totalCorrect = history.reduce((sum, h) => sum + h.correct_count, 0);
  const totalIncorrect = history.reduce((sum, h) => sum + h.incorrect_count, 0);
  const accuracy =
    totalCorrect + totalIncorrect > 0
      ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100)
      : 0;

  const recentHistory = history.slice(0, 8);
  const scoreMax = bestScore || 100;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero skeleton */}
        <div className="nq-card animate-pulse rounded-[34px] p-6 md:p-8">
          <div className="h-3 w-32 rounded-full bg-[#70A2F9]/18 mb-3" />
          <div className="h-8 w-48 rounded-full bg-[#70A2F9]/18 mb-4" />
          <div className="h-3 w-3/4 rounded-full bg-[#70A2F9]/18" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-20 rounded-[24px] bg-white/60" />
            ))}
          </div>
        </div>
        {/* Cards skeleton */}
        <div className="nq-card animate-pulse rounded-[28px] p-6 h-48" />
        <div className="nq-card animate-pulse rounded-[28px] p-6 h-48" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-7">

      {/* ── Hero banner — same decoration as History & Dashboard ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="nq-card relative overflow-hidden rounded-[34px] p-6 md:p-8"
      >
        {/* Decorative radial overlay — identical to history page */}
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.38),transparent_65%)]" />
        <div className="absolute inset-y-0 right-[-36px] top-[14px] w-48 rounded-full border border-[#0460A9]/10 bg-[#70A2F9]/08" />
        <div className="absolute inset-y-0 right-[18px] top-[-20px] w-36 rounded-full border border-[#0460A9]/10 bg-[#70A2F9]/10" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: label + title + subtitle */}
          <div className="max-w-xl">
            <p className="nq-details font-bold text-[#5D7EA1]">Your performance</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F] md:text-4xl font-display tracking-tight">
              Stats
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#5D7EA1] font-medium">
              Track your lifetime totals, score distribution, and recent quiz activity
              across all completed sessions.
            </p>
          </div>

          {/* Right: inline stat mini-cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto lg:min-w-[440px]">
            <Card.Tile label="Total Played" value={totalPlayed} />
            <Card.Tile label="Best Score" value={bestScore.toLocaleString()} />
            <Card.Tile label="Avg Score" value={avgScore.toLocaleString()} />
            <Card.Tile label="Best Streak" value={bestStreak} />
          </div>
        </div>
      </motion.section>

      {totalPlayed === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="nq-card rounded-[34px] p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-4xl shadow-lg shadow-[#0460A9]/20">
            🎯
          </div>
          <h2 className="text-xl font-bold text-[#16324F] font-display">No data yet</h2>
          <p className="mt-2 text-sm text-[#5D7EA1] font-medium">
            Play some quizzes to start seeing your stats here.
          </p>
        </motion.div>
      ) : (
        <>
          {/* ── Secondary stat row (Accuracy + Correct answers) ── */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
            className="nq-card rounded-[30px] p-4 md:p-5"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card.Tile label="Accuracy" value={`${accuracy}%`} />
              <Card.Tile label="Correct" value={totalCorrect} className="[&_p:last-child]:text-[#0D8C6D]" />
              <Card.Tile label="Wrong" value={totalIncorrect} className="[&_p:last-child]:text-[#E67E22]" />
              <Card.Tile
                label="Top Rank"
                value={history.length ? `#${Math.min(...history.map((h) => h.rank))}` : "—"}
              />
            </div>
          </motion.section>

          {/* ── Score Distribution ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.35 }}
            className="nq-card rounded-[34px] p-6 md:p-8"
          >
            <div className="flex flex-col gap-5 border-b border-[#0460A9]/10 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">
                  Score chart
                </p>
                <h2 className="mt-2 text-2xl font-bold text-[#16324F]">Score Distribution</h2>
                <p className="mt-2 text-sm text-[#5D7EA1]">
                  Your last {recentHistory.length} quiz scores compared to your personal best.
                </p>
              </div>
              <div className="rounded-[24px] bg-[#EAF5FF] px-4 py-3 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">
                  Personal best
                </p>
                <p className="mt-2 text-2xl font-bold text-[#0460A9]">
                  {bestScore.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {recentHistory.map((entry, i) => (
                <motion.div
                  key={entry.session_id + i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.04 }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span
                      className="truncate text-xs font-semibold text-[#16324F]"
                      style={{ maxWidth: "55%" }}
                    >
                      {entry.session_name}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#0460A9]/08 px-2.5 py-0.5 text-[11px] font-semibold text-[#0460A9]">
                      Rank #{entry.rank}/{entry.total_players}
                    </span>
                  </div>
                  <ScoreBar score={entry.total_score} max={scoreMax} />
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── Recent Activity ── same card-row style as History "My attempts" */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.35 }}
            className="nq-card rounded-[34px] p-4 md:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">
                  History
                </p>
                <h2 className="mt-2 text-xl font-bold text-[#16324F]">Recent Activity</h2>
              </div>
            </div>

            <div className="space-y-3">
              {recentHistory.map((entry, i) => (
                <motion.div
                  key={entry.session_id + i + "card"}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  className="nq-card-soft w-full rounded-[28px] p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: name + date */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#0460A9]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0460A9]">
                          Attempt
                        </span>
                        <span className="text-sm font-medium text-[#5D7EA1]">
                          {new Date(entry.completed_at).toLocaleDateString([], {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate text-lg font-bold text-[#16324F]">
                        {entry.session_name}
                      </h3>
                      {entry.session_description && (
                        <p className="mt-1 text-sm text-[#5D7EA1] line-clamp-1">
                          {entry.session_description}
                        </p>
                      )}
                    </div>

                    {/* Right: stat mini-cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[380px]">
                      <div className="rounded-[22px] bg-white/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Score</p>
                        <p className="mt-1.5 text-xl font-bold text-[#0460A9]">{entry.total_score}</p>
                      </div>
                      <div className="rounded-[22px] bg-white/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Rank</p>
                        <p className="mt-1.5 text-xl font-bold text-[#16324F]">
                          #{entry.rank}
                          <span className="text-sm font-medium text-[#5D7EA1]">/{entry.total_players}</span>
                        </p>
                      </div>
                      <div className="rounded-[22px] bg-white/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Correct</p>
                        <p className="mt-1.5 text-xl font-bold text-[#0D8C6D]">
                          {entry.correct_count}/{entry.correct_count + entry.incorrect_count}
                        </p>
                      </div>
                      <div className="rounded-[22px] bg-white/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Streak</p>
                        <p className="mt-1.5 text-xl font-bold text-[#E67E22]">{entry.streak}</p>
                      </div>
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#0460A9]/10 pt-4">
                    <p className="text-sm text-[#5D7EA1]">
                      Time: {formatTime(entry.total_time_ms)}
                    </p>
                    <span className="text-sm font-semibold text-[#0460A9]">
                      Accuracy {entry.correct_count + entry.incorrect_count > 0
                        ? Math.round((entry.correct_count / (entry.correct_count + entry.incorrect_count)) * 100)
                        : 0}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </>
      )}
    </div>
  );
}
