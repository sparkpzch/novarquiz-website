"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion, AnimatePresence } from "motion/react";
import type { Quiz, Session } from "@/lib/types";
import dynamic from "next/dynamic";
const QuizzesManager = dynamic(() => import("./QuizzesManager"), { loading: () => <p role="status">Loading quiz manager…</p> });
import {
  watchRoom,
  type SessionRoom,
} from "@/lib/firebase/rtdb";

interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  questionsCreated: number;
  avgScore: number;
  totalPlaySessions: number;
  completionRate: number;
  avgTimeMs: number;
  monthlyActivity: number[];
  userGrowth?: number[];
  scoreDistribution: { correct: number; incorrect: number };
  scoreHistogram: number[];
  topQuizzes: Array<{
    id: string;
    name: string;
    play_count: number;
    avg_score: number;
    completion_rate: number;
  }>;
  topPlayers: Array<{
    user_display_name: string;
    total_sessions: number;
    best_score: number;
    avg_score: number;
  }>;
  recentActivity: Array<{
    user_display_name: string;
    session_name: string;
    total_score: number;
    correct_count: number;
    incorrect_count: number;
    streak: number;
    total_time_ms: number;
    completed_at: string | null;
  }>;
  /** Which approved insight summary each player is currently reaching. */
  insightSummaries?: {
    rows: Array<{ quiz_id: string; quiz_name: string; headline: string; players: number }>;
    playersWithSummary: number;
    playersWithoutSummary: number;
  };
}

type AdminTab = "dashboard" | "quizzes-manager";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="py-3 px-3">
          <div className="h-4 bg-white/10 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function AdminDashboardContent() {
  const { t } = useTranslation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dataError, setDataError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [statsRetry, setStatsRetry] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fetchingStats, setFetchingStats] = useState(true);
  const [allData, setAllData] = useState<Quiz[]>([]);
  const [allSessions, setAllSessions] = useState<(Session & { quiz_name?: string })[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [rooms, setRooms] = useState<Record<string, SessionRoom>>({});

  const tabParam = searchParams.get("tab") as AdminTab | null;
  const activeTab: AdminTab =
    tabParam === "quizzes-manager" ||
      tabParam === "dashboard"
      ? tabParam
      : "dashboard";

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setDataError("");
    const results = await Promise.allSettled([
      fetch("/api/quizzes?all=true", { signal: AbortSignal.timeout(20000) }).then(async r => {
        if (!r.ok) throw new Error("Could not load quizzes");
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error("Invalid quiz response");
        setAllData(data);
      }),
      fetch("/api/sessions", { signal: AbortSignal.timeout(20000) }).then(async r => {
        if (!r.ok) throw new Error("Could not load sessions");
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error("Invalid session response");
        setAllSessions(data);
      }),
    ]);
    if (results.some(result => result.status === "rejected")) {
      setDataError("Some data could not be loaded. Please retry.");
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!isAdmin || activeTab !== "dashboard") return;
    const controller = new AbortController();
    // Loading state belongs to this external request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchingStats(true);
    setStatsError("");
    fetch("/api/admin/stats", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async r => {
        if (!r.ok) throw new Error("Could not load statistics");
        return r.json();
      })
      .then(data => { if (!controller.signal.aborted) setStats(data); })
      .catch(() => { if (!controller.signal.aborted) setStatsError("Statistics could not be loaded. Please retry."); })
      .finally(() => { if (!controller.signal.aborted) setFetchingStats(false); });
    return () => controller.abort();
  }, [isAdmin, activeTab, statsRetry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin && activeTab === "quizzes-manager") void fetchData();
  }, [isAdmin, activeTab, fetchData]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "quizzes-manager") return;
    // RTDB rules permit reads at /sessions/:id, not at the sessions root.
    const unsubscribers = allSessions.map(session => watchRoom(session.id, room => {
      setRooms(previous => {
        const next = { ...previous };
        if (room) next[session.id] = room;
        else delete next[session.id];
        return next;
      });
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [isAdmin, activeTab, allSessions]);

  const handleDeleteQuiz = async (id: string) => {
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete quiz");
    setAllData((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete session");
    setAllSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDuplicate = async (id: string, isQuizDuplicate: boolean) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/quizzes/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: user.uid, isQuizDuplicate }),
      });
      if (!res.ok) throw new Error("Failed to duplicate quiz");
      await fetchData();
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateSession = async (quizId: string, isPrivate: boolean, name?: string) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, userId: user.uid, isPrivate, name }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create session");
      }
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setLoadingData(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !currentStatus }),
      });
      if (res.ok) {
        setAllData((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, is_published: !currentStatus } : s,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !isAdmin) return null;

  const statCards = [
    {
      label: t("admin.total_users"),
      value: stats?.totalUsers ?? "—",
      icon: "👥",
      color: "from-[#055A9E] via-[#0460A9] to-[#92BFFF]",
      sub: "Registered accounts",
    },
    {
      label: t("admin.active_sessions"),
      value: stats?.activeSessions ?? "—",
      icon: "🎯",
      color: "from-[#0460A9] to-[#92BFFF]",
      sub: "Published quizzes",
    },
    {
      label: t("admin.questions_created"),
      value: stats?.questionsCreated ?? "—",
      icon: "❓",
      color: "from-[#055A9E] to-[#92BFFF]",
      sub: "Total questions",
    },
  ];

  const maxActivity = stats ? Math.max(...stats.monthlyActivity, 1) : 1;
  const maxQuizPlays = stats?.topQuizzes.length
    ? Math.max(...stats.topQuizzes.map((q) => q.play_count), 1)
    : 1;

  return (
    <div
      className={`nq-admin-panel mx-auto w-full space-y-10 ${
        activeTab === "quizzes-manager" ? "max-w-[1600px]" : "max-w-6xl"
      }`}
    >
      {(activeTab === "dashboard" ? statsError : dataError) && (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
          {activeTab === "dashboard" ? statsError : dataError}
          <button className="ml-4 underline" onClick={() => activeTab === "dashboard" ? setStatsRetry(n => n + 1) : void fetchData()}>Retry</button>
        </div>
      )}
      {activeTab === "quizzes-manager" && loadingData && <p role="status">Loading quizzes and sessions…</p>}
      <AnimatePresence mode="wait" initial={false}>
        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {statCards.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/[0.08] transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl">{s.icon}</span>
                    {fetchingStats && (
                      <div className="w-8 h-3 bg-white/10 rounded animate-pulse" />
                    )}
                  </div>
                  <p className="text-2xl font-bold text-white mb-0.5 leading-none">
                    {fetchingStats ? (
                      <span className="inline-block w-12 h-7 bg-white/10 rounded animate-pulse" />
                    ) : (
                      s.value
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-tight">
                    {s.label}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{s.sub}</p>
                  <div
                    className={`mt-2.5 h-0.5 rounded-full bg-linear-to-r ${s.color} opacity-60`}
                  />
                </div>
              ))}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Play Sessions Chart */}
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Play Sessions
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Monthly activity — last 12 months
                    </p>
                  </div>
                  {stats && (
                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
                      {stats.monthlyActivity.reduce((a, b) => a + b, 0)} total
                    </span>
                  )}
                </div>
                <div className="h-44 flex items-end gap-1.5">
                  {(stats?.monthlyActivity ?? new Array(12).fill(0)).map(
                    (count, i) => {
                      const pct =
                        maxActivity > 0
                          ? Math.max(
                            (count / maxActivity) * 100,
                            count > 0 ? 4 : 0,
                          )
                          : 0;
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                        >
                          {count > 0 && (
                            <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {count}
                            </span>
                          )}
                          <div
                            title={`${MONTHS[i]}: ${count} sessions`}
                            style={{ height: `${pct}%` }}
                            className="w-full rounded-t-lg bg-linear-to-t from-[#055A9E] via-[#0460A9] to-[#92BFFF] opacity-85 hover:opacity-100 transition-opacity cursor-default"
                          />
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-gray-500">
                  {MONTHS.map((m) => (
                    <span key={m} className="flex-1 text-center">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* User Growth Chart */}
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      User Growth
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      New registrations — last 12 months
                    </p>
                  </div>
                  {stats && (
                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
                      {stats.totalUsers} users
                    </span>
                  )}
                </div>
                <div className="h-44 flex items-end gap-1.5">
                  {(stats?.userGrowth ?? new Array(12).fill(0)).map(
                    (count, i) => {
                      const maxGrowth = Math.max(...(stats?.userGrowth ?? [1]), 1);
                      const pct = (count / maxGrowth) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                        >
                          {count > 0 && (
                            <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {count}
                            </span>
                          )}
                          <div
                            title={`${MONTHS[i]}: ${count} new users`}
                            style={{ height: `${pct || (count > 0 ? 4 : 0)}%` }}
                            className="w-full rounded-t-lg bg-linear-to-t from-[#70A2F9] to-[#92BFFF] opacity-85 hover:opacity-100 transition-opacity cursor-default"
                          />
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-gray-500">
                  {MONTHS.map((m) => (
                    <span key={m} className="flex-1 text-center">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Quizzes */}
            <div className="grid grid-cols-1 gap-6">
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Top Quizzes
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      By number of completions
                    </p>
                  </div>
                </div>
                {fetchingStats ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-12 bg-white/10 rounded-xl animate-pulse"
                      />
                    ))}
                  </div>
                ) : !stats?.topQuizzes.length ? (
                  <p className="text-sm text-gray-500">No quiz data yet.</p>
                ) : (
                  <div className="space-y-4">
                    {stats.topQuizzes.map((quiz, i) => (
                      <div key={quiz.id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-600 w-4 text-right shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-sm font-medium text-white truncate">
                              {quiz.name}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-indigo-400 font-medium">
                                {quiz.avg_score}pts
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${quiz.completion_rate >= 70
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : quiz.completion_rate >= 40
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-red-500/20 text-red-300"
                                  }`}
                              >
                                {quiz.completion_rate}%
                              </span>
                            </div>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-linear-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                              style={{
                                width: `${(quiz.play_count / maxQuizPlays) * 100}%`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {quiz.play_count} play
                            {quiz.play_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI insight summaries — which wording is reaching how many players */}
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-white">AI Insight Summaries</h3>
                <p className="mt-1 text-xs text-gray-400">
                  Approved wording currently shown on players&apos; stats pages, and how many
                  players each one reaches. Drafted ahead of time and human-approved — nothing
                  here is generated while a player is looking at it.
                </p>
              </div>

              {(() => {
                const ins = stats?.insightSummaries;
                const reached = ins?.playersWithSummary ?? 0;
                const missed = ins?.playersWithoutSummary ?? 0;
                return (
                  <>
                    <div className="mb-5 flex flex-wrap gap-3">
                      <div className="rounded-xl bg-white/5 px-4 py-3">
                        <p className="text-xs text-gray-400">Players reached</p>
                        <p className="text-xl font-bold text-white">{reached}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 px-4 py-3">
                        <p className="text-xs text-gray-400">No match yet</p>
                        <p className="text-xl font-bold text-white">{missed}</p>
                      </div>
                    </div>

                    {!ins?.rows.length ? (
                      <p className="text-sm text-gray-400">
                        No approved summaries are reaching anyone yet. Draft and approve wording
                        in Insight Summaries.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {ins.rows.map((row) => {
                          const pct = reached > 0 ? Math.round((row.players / reached) * 100) : 0;
                          return (
                            <div key={`${row.quiz_id}-${row.headline}`} className="space-y-1.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-white">{row.headline}</p>
                                  <p className="truncate text-xs text-gray-500">{row.quiz_name}</p>
                                </div>
                                <span className="shrink-0 text-sm font-bold text-white">
                                  {row.players}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#2BB39A] to-[#5AADFF]"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Recent Activity */}
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {t("admin.recent_activity")}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last 25 completions
                  </p>
                </div>
                {stats && (
                  <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
                    Avg time: {formatDuration(stats.avgTimeMs)}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-white/5 text-xs">
                      <th className="text-left py-3 px-3 font-medium">
                        Player
                      </th>
                      <th className="text-left py-3 px-3 font-medium">Quiz</th>
                      <th className="text-right py-3 px-3 font-medium">
                        Score
                      </th>
                      <th className="text-right py-3 px-3 font-medium text-emerald-600">
                        ✓ Correct
                      </th>
                      <th className="text-right py-3 px-3 font-medium text-red-600">
                        ✗ Wrong
                      </th>
                      <th className="text-right py-3 px-3 font-medium">
                        Streak
                      </th>
                      <th className="text-right py-3 px-3 font-medium">Time</th>
                      <th className="text-right py-3 px-3 font-medium">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetchingStats ? (
                      [1, 2, 3, 4, 5].map((i) => (
                        <SkeletonRow key={i} cols={8} />
                      ))
                    ) : !stats?.recentActivity.length ? (
                      <tr className="border-b border-white/5 text-gray-400">
                        <td className="py-4 px-3" colSpan={8}>
                          No activity yet
                        </td>
                      </tr>
                    ) : (
                      stats.recentActivity.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-white/5 text-gray-300 hover:bg-white/[0.04] transition-colors"
                        >
                          <td className="py-3 px-3 font-medium text-white">
                            {row.user_display_name}
                          </td>
                          <td className="py-3 px-3 text-gray-400 max-w-[140px]">
                            <span className="block truncate">
                              {row.session_name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-indigo-400">
                            {row.total_score}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-400">
                            {row.correct_count}
                          </td>
                          <td className="py-3 px-3 text-right text-red-400">
                            {row.incorrect_count ?? "—"}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-400">
                            {row.streak > 0 ? (
                              `🔥 ${row.streak}`
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-400 text-xs">
                            {formatDuration(row.total_time_ms)}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-500 text-xs">
                            {row.completed_at
                              ? new Date(row.completed_at).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── QUIZZES MANAGER TAB ── */}
        {activeTab === "quizzes-manager" && (
          <motion.div
            key="quizzes-manager"
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <QuizzesManager
              allData={allData}
              allSessions={allSessions}
              rooms={rooms}
              onDuplicate={handleDuplicate}
              onCreateSession={handleCreateSession}
              onDeleteQuiz={handleDeleteQuiz}
              onDeleteSession={handleDeleteSession}
              onToggleStatus={handleToggleStatus}
              onRefresh={fetchData}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <AdminDashboardContent />
    </Suspense>
  );
}
