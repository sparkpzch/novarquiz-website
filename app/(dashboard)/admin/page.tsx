"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion, AnimatePresence } from "motion/react";
import type { Quiz } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import QuizzesManager from "./QuizzesManager";
import {
  watchSessionRooms,
  endRoom,
  closeLobby,
  type PlayerScore,
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
}

type LiveSession = {
  session: Quiz;
  room: SessionRoom;
  liveAt: number;
};

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
const SCORE_BUCKETS = ["< 0", "0–25", "26–50", "51–75", "76–100", "> 100"];
const ADMIN_TABS: Array<{ id: AdminTab; label: string; description: string }> =
  [
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Platform analytics and recent activity",
    },
    {
      id: "quizzes-manager",
      label: "Quizzes Manager",
      description: "Manage your quiz library and active sessions",
    },
  ];

function formatClockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function getLatestActivity(room: SessionRoom) {
  const playerJoins = Object.values(room.players ?? {}).map((p) => p.joinedAt);
  const scoreUpdates = Object.values(room.scores ?? {}).map((s) => s.updatedAt);
  return Math.max(0, ...playerJoins, ...scoreUpdates);
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
  const { showToast } = useToast();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fetchingStats, setFetchingStats] = useState(true);
  const [allData, setAllData] = useState<Quiz[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [rooms, setRooms] = useState<Record<string, SessionRoom>>({});
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  const tabParam = searchParams.get("tab") as AdminTab | null;
  const activeTab: AdminTab =
    tabParam === "quizzes-manager" ||
      tabParam === "dashboard"
      ? tabParam
      : "dashboard";

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const fetchData = () => {
    Promise.all([
      fetch("/api/questions/sessions?all=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sessions").then((r) => (r.ok ? r.json() : []))
    ])
      .then(([quizzes, sessionsData]) => {
        setAllData(quizzes);
        setAllSessions(sessionsData);
      })
      .catch(() => { })
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => { })
      .finally(() => setFetchingStats(false));
    fetchData();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    return watchSessionRooms(setRooms);
  }, [isAdmin]);

  const liveSessions = useMemo<LiveSession[]>(() => {
    return allData
      .map((session) => {
        const room = rooms[session.id];
        if (!room || (room.status !== "waiting" && room.status !== "started"))
          return null;
        return { session, room, liveAt: getLatestActivity(room) };
      })
      .filter((entry): entry is LiveSession => entry !== null)
      .sort((a, b) => {
        if (a.room.status !== b.room.status)
          return a.room.status === "started" ? -1 : 1;
        return b.liveAt - a.liveAt;
      });
  }, [allData, rooms]);

  const currentLive = liveSessions[0] ?? null;
  const sessions = allData;

  const handleDeleteQuiz = async (id: string) => {
    await fetch(`/api/questions/sessions/${id}`, { method: "DELETE" });
    setAllData((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setAllSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDuplicate = async (id: string, isQuizDuplicate: boolean) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/questions/sessions/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: user.uid, isQuizDuplicate }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateSession = async (quizId: string, isPrivate: boolean) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, userId: user.uid, isPrivate }),
      });
      if (res.ok) {
        fetchData();
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
      const res = await fetch(`/api/questions/sessions/${id}`, {
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

  const handleCloseSession = async () => {
    if (!currentLive) return;
    if (!confirm("Close this session? Players will be disconnected.")) return;
    try {
      await endRoom(currentLive.session.id);
      await closeLobby(currentLive.session.id);
      showToast("Session closed", "success");
    } catch {
      showToast("Failed to close session", "error");
    }
  };

  const copyInvite = async (live: LiveSession) => {
    if (typeof window === "undefined" || !live.room.joinToken) return;
    const shareLink = `${window.location.origin}/join/${live.room.joinToken}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedSessionId(live.session.id);
      showToast("Invite link copied", "success");
      setTimeout(
        () => setCopiedSessionId((c) => (c === live.session.id ? null : c)),
        2000,
      );
    } catch {
      showToast("Could not copy invite link", "error");
    }
  };

  if (authLoading || !isAdmin) return null;

  const liveShareLink =
    currentLive?.room.joinToken && typeof window !== "undefined"
      ? `${window.location.origin}/join/${currentLive.room.joinToken}`
      : "";
  const livePlayers = Object.entries(currentLive?.room.players ?? {});
  const liveScores = Object.values(
    currentLive?.room.scores ?? {},
  ) as PlayerScore[];
  const finishedCount = liveScores.filter((s) => s.finished).length;

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
    {
      label: t("admin.avg_scores"),
      value: stats ? `${stats.avgScore}pts` : "—",
      icon: "📈",
      color: "from-[#0460A9] via-[#055A9E] to-[#92BFFF]",
      sub: "Per completion",
    },
    {
      label: "Total Completions",
      value: stats?.totalPlaySessions ?? "—",
      icon: "🎮",
      color: "from-[#055A9E] to-[#92BFFF]",
      sub: "Finished sessions",
    },
    {
      label: "Completion Rate",
      value: stats ? `${stats.completionRate}%` : "—",
      icon: "✅",
      color: "from-[#0460A9] to-[#92BFFF]",
      sub: "Finished / started",
    },
  ];

  const maxActivity = stats ? Math.max(...stats.monthlyActivity, 1) : 1;
  const correctPct = stats?.scoreDistribution.correct ?? 0;
  const incorrectPct = stats?.scoreDistribution.incorrect ?? 0;
  const C = 502.65;
  const correctDash = (correctPct / 100) * C;
  const incorrectDash = (incorrectPct / 100) * C;
  const maxHistogram = stats ? Math.max(...stats.scoreHistogram, 1) : 1;
  const maxQuizPlays = stats?.topQuizzes.length
    ? Math.max(...stats.topQuizzes.map((q) => q.play_count), 1)
    : 1;

  return (
    <div className="nq-admin-panel max-w-6xl mx-auto space-y-10">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

            {/* Activity Chart + Answer Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly Activity (spans 2 cols) */}
              <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-white/5 p-6">
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

              {/* Answer Distribution */}
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-white">
                    Answer Distribution
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Correct vs incorrect across all answers
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  {fetchingStats ? (
                    <div className="w-32 h-32 rounded-full border-[18px] border-white/10 animate-pulse" />
                  ) : (
                    <svg viewBox="0 0 200 200" className="w-32 h-32">
                      <circle
                        cx="100"
                        cy="100"
                        r="80"
                        fill="none"
                        stroke="rgba(4,96,169,0.12)"
                        strokeWidth="22"
                      />
                      {correctDash > 0 && (
                        <circle
                          cx="100"
                          cy="100"
                          r="80"
                          fill="none"
                          stroke="url(#grad1)"
                          strokeWidth="22"
                          strokeDasharray={`${correctDash} ${C}`}
                          strokeLinecap="round"
                          transform="rotate(-90 100 100)"
                        />
                      )}
                      {incorrectDash > 0 && (
                        <circle
                          cx="100"
                          cy="100"
                          r="80"
                          fill="none"
                          stroke="url(#grad2)"
                          strokeWidth="22"
                          strokeDasharray={`${incorrectDash} ${C}`}
                          strokeDashoffset={-correctDash}
                          strokeLinecap="round"
                          transform="rotate(-90 100 100)"
                        />
                      )}
                      <defs>
                        <linearGradient id="grad1">
                          <stop stopColor="#055A9E" />
                          <stop offset="0.55" stopColor="#0460A9" />
                          <stop offset="1" stopColor="#92BFFF" />
                        </linearGradient>
                        <linearGradient id="grad2">
                          <stop stopColor="#0B7F8E" />
                          <stop offset="1" stopColor="#20B8C7" />
                        </linearGradient>
                      </defs>
                      <text
                        x="100"
                        y="96"
                        textAnchor="middle"
                        fill="#16324F"
                        fontSize="18"
                        fontWeight="bold"
                      >
                        {correctPct}%
                      </text>
                      <text
                        x="100"
                        y="113"
                        textAnchor="middle"
                        fill="#5D7EA1"
                        fontSize="11"
                      >
                        correct
                      </text>
                    </svg>
                  )}
                  <div className="mt-3 w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                        <span className="text-xs text-gray-400">Correct</span>
                      </div>
                      <span className="text-xs font-semibold text-white">
                        {correctPct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs text-gray-400">Incorrect</span>
                      </div>
                      <span className="text-xs font-semibold text-white">
                        {incorrectPct}%
                      </span>
                    </div>
                    {stats && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <p className="text-[10px] text-gray-500 mb-0.5">
                          Avg completion time
                        </p>
                        <p className="text-sm font-semibold text-white">
                          {formatDuration(stats.avgTimeMs)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Score Histogram */}
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Score Distribution
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    How player total scores are spread
                  </p>
                </div>
                {stats && (
                  <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
                    {stats.scoreHistogram.reduce((a, b) => a + b, 0)} players
                  </span>
                )}
              </div>
              {fetchingStats ? (
                <div className="h-32 flex items-end gap-3">
                  {[40, 60, 80, 100, 70, 30].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-white/10 rounded-t animate-pulse"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="h-32 flex items-end gap-3">
                    {(stats?.scoreHistogram ?? new Array(6).fill(0)).map(
                      (count, i) => {
                        const pct = Math.max(
                          (count / maxHistogram) * 100,
                          count > 0 ? 6 : 0,
                        );
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                          >
                            {count > 0 && (
                              <span className="text-[10px] text-gray-400">
                                {count}
                              </span>
                            )}
                            <div
                              title={`${SCORE_BUCKETS[i]}: ${count} players`}
                              style={{ height: `${pct}%` }}
                              className="w-full rounded-t bg-linear-to-t from-[#055A9E] via-[#0460A9] to-[#92BFFF] opacity-85 hover:opacity-100 transition-opacity cursor-default"
                            />
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="flex mt-2">
                    {SCORE_BUCKETS.map((label, i) => (
                      <span
                        key={i}
                        className="flex-1 text-center text-[10px] text-gray-500"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Top Quizzes + Top Players */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Quizzes */}
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

              {/* Top Players */}
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Top Players
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      By best single-session score
                    </p>
                  </div>
                </div>
                {fetchingStats ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-12 bg-white/10 rounded-xl animate-pulse"
                      />
                    ))}
                  </div>
                ) : !stats?.topPlayers.length ? (
                  <p className="text-sm text-gray-500">No players yet.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topPlayers.map((player, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                      >
                        <span className="text-sm w-7 text-center shrink-0">
                          {i === 0 ? (
                            "🥇"
                          ) : i === 1 ? (
                            "🥈"
                          ) : i === 2 ? (
                            "🥉"
                          ) : (
                            <span className="text-xs font-bold text-gray-600">
                              #{i + 1}
                            </span>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {player.user_display_name}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {player.total_sessions} session
                            {player.total_sessions !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-rose-400">
                            {player.best_score}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {player.avg_score} avg
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
