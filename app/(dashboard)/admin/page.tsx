'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { watchSessionRooms, type PlayerScore, type SessionRoom } from '@/lib/firebase/rtdb';

interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  questionsCreated: number;
  avgScore: number;
  monthlyActivity: number[];
  scoreDistribution: { correct: number; incorrect: number };
  recentActivity: Array<{
    user_display_name: string;
    session_name: string;
    total_score: number;
    correct_count: number;
    completed_at: string | null;
  }>;
}

type LiveSession = {
  session: Quiz;
  room: SessionRoom;
  liveAt: number;
};

type AdminTab = 'dashboard' | 'session-manager' | 'question-manager';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ADMIN_TABS: Array<{ id: AdminTab; label: string; description: string }> = [
  { id: 'dashboard', label: 'Dashboard', description: 'Platform analytics and recent activity' },
  { id: 'session-manager', label: 'Session Manager', description: 'Control the current live quiz session' },
  { id: 'question-manager', label: 'Question Manager', description: 'Create quizzes and manage lobbies' },
];

function formatClockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLatestActivity(room: SessionRoom) {
  const playerJoins = Object.values(room.players ?? {}).map((player) => player.joinedAt);
  const scoreUpdates = Object.values(room.scores ?? {}).map((score) => score.updatedAt);
  return Math.max(0, ...playerJoins, ...scoreUpdates);
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
  const [loadingData, setLoadingData] = useState(true);
  const [rooms, setRooms] = useState<Record<string, SessionRoom>>({});
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const tabParam = searchParams.get('tab') as AdminTab | null;
  const activeTab: AdminTab =
    tabParam === 'session-manager' || tabParam === 'question-manager' || tabParam === 'dashboard'
      ? tabParam
      : 'dashboard';

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/');
  }, [authLoading, isAdmin, router]);

  const fetchData = () => {
    fetch('/api/questions/sessions?all=true')
      .then(r => r.ok ? r.json() : [])
      .then(setAllData)
      .catch(() => {})
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/stats')
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
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
        if (!room || (room.status !== 'waiting' && room.status !== 'started')) return null;
        return {
          session,
          room,
          liveAt: getLatestActivity(room),
        };
      })
      .filter((entry): entry is LiveSession => entry !== null)
      .sort((a, b) => {
        if (a.room.status !== b.room.status) {
          return a.room.status === 'started' ? -1 : 1;
        }
        return b.liveAt - a.liveAt;
      });
  }, [allData, rooms]);

  const currentLive = liveSessions[0] ?? null;
  const sessions = allData;

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item? This action cannot be undone.')) return;
    await fetch(`/api/questions/sessions/${id}`, { method: 'DELETE' });
    setAllData(prev => prev.filter(s => s.id !== id));
  };

  const handleDuplicate = async (id: string, isQuizDuplicate: boolean) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/questions/sessions/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: user.uid, isQuizDuplicate })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/questions/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !currentStatus })
      });
      if (res.ok) {
        setAllData(prev => prev.map(s => s.id === id ? { ...s, is_published: !currentStatus } : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyInvite = async (live: LiveSession) => {
    if (typeof window === 'undefined' || !live.room.joinToken) return;
    const shareLink = `${window.location.origin}/join/${live.room.joinToken}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedSessionId(live.session.id);
      showToast('Invite link copied', 'success');
      setTimeout(() => setCopiedSessionId((current) => current === live.session.id ? null : current), 2000);
    } catch {
      showToast('Could not copy invite link', 'error');
    }
  };

  if (authLoading || !isAdmin) return null;

  const liveShareLink = currentLive?.room.joinToken && typeof window !== 'undefined'
    ? `${window.location.origin}/join/${currentLive.room.joinToken}`
    : '';
  const livePlayers = Object.entries(currentLive?.room.players ?? {});
  const liveScores = Object.values(currentLive?.room.scores ?? {}) as PlayerScore[];
  const finishedCount = liveScores.filter((score) => score.finished).length;
  const statCards = [
    { label: t('admin.total_users'), value: stats?.totalUsers ?? '—', icon: '👥', color: 'from-indigo-500 to-purple-500' },
    { label: t('admin.active_sessions'), value: stats?.activeSessions ?? '—', icon: '🎯', color: 'from-emerald-500 to-teal-500' },
    { label: t('admin.questions_created'), value: stats?.questionsCreated ?? '—', icon: '❓', color: 'from-amber-500 to-orange-500' },
    { label: t('admin.avg_scores'), value: stats ? `${stats.avgScore}pts` : '—', icon: '📈', color: 'from-rose-500 to-pink-500' },
  ];
  const maxActivity = stats ? Math.max(...stats.monthlyActivity, 1) : 1;
  const correctPct = stats?.scoreDistribution.correct ?? 0;
  const incorrectPct = stats?.scoreDistribution.incorrect ?? 0;
  const C = 502.65;
  const correctDash = (correctPct / 100) * C;
  const incorrectDash = (incorrectPct / 100) * C;

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Command Center</h1>
          <p className="text-gray-400 mt-1">Bring analytics back on Dashboard, keep live control in Session Manager, and manage quizzes in Question Manager.</p>
        </div>
        {activeTab === 'question-manager' && (
          <Link href="/admin/questions/create">
            <Button icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>}>
              Create Quiz
            </Button>
          </Link>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ADMIN_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/admin?tab=${tab.id}`}
              className={`rounded-2xl px-4 py-3 transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600/20 text-white shadow-lg shadow-indigo-500/10'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <p className="font-semibold">{tab.label}</p>
              <p className="mt-1 text-xs text-inherit/80">{tab.description}</p>
            </Link>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/5 bg-white/5 p-5 hover:bg-white/[0.08] transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl">{s.icon}</span>
                    {fetchingStats && <div className="w-12 h-4 bg-white/10 rounded animate-pulse" />}
                  </div>
                  <p className="text-3xl font-bold text-white mb-1">
                    {fetchingStats ? <span className="inline-block w-16 h-8 bg-white/10 rounded animate-pulse" /> : s.value}
                  </p>
                  <p className="text-sm text-gray-400">{s.label}</p>
                  <div className={`mt-3 h-1 rounded-full bg-gradient-to-r ${s.color} opacity-60`} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Play Sessions (12 months)</h3>
                <div className="h-48 flex items-end gap-1.5">
                  {(stats?.monthlyActivity ?? new Array(12).fill(0)).map((count, i) => {
                    const pct = maxActivity > 0 ? Math.max((count / maxActivity) * 100, count > 0 ? 4 : 0) : 0;
                    return (
                      <div key={i} title={`${MONTHS[i]}: ${count} sessions`} style={{ height: `${pct}%` }} className="flex-1 rounded-t-lg bg-gradient-to-t from-indigo-600 to-purple-500 opacity-80 hover:opacity-100 transition-opacity cursor-default" />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  {MONTHS.map(m => <span key={m}>{m}</span>)}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Answer Distribution</h3>
                <div className="flex items-center justify-center h-48">
                  {fetchingStats ? (
                    <div className="w-40 h-40 rounded-full border-[20px] border-white/10 animate-pulse" />
                  ) : (
                    <svg viewBox="0 0 200 200" className="w-40 h-40">
                      <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="20" />
                      {correctDash > 0 && (
                        <circle cx="100" cy="100" r="80" fill="none" stroke="url(#grad1)" strokeWidth="20" strokeDasharray={`${correctDash} ${C}`} strokeLinecap="round" transform="rotate(-90 100 100)" />
                      )}
                      {incorrectDash > 0 && (
                        <circle cx="100" cy="100" r="80" fill="none" stroke="url(#grad2)" strokeWidth="20" strokeDasharray={`${incorrectDash} ${C}`} strokeDashoffset={-correctDash} strokeLinecap="round" transform="rotate(-90 100 100)" />
                      )}
                      <defs>
                        <linearGradient id="grad1"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#a855f7"/></linearGradient>
                        <linearGradient id="grad2"><stop stopColor="#10b981"/><stop offset="1" stopColor="#06b6d4"/></linearGradient>
                      </defs>
                      <text x="100" y="96" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">{correctPct}%</text>
                      <text x="100" y="114" textAnchor="middle" fill="#9ca3af" fontSize="11">correct</text>
                    </svg>
                  )}
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500" /><span className="text-sm text-gray-400">Correct ({correctPct}%)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-sm text-gray-400">Incorrect ({incorrectPct}%)</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t('admin.recent_activity')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-white/5">
                      <th className="text-left py-3 px-4 font-medium">User</th>
                      <th className="text-left py-3 px-4 font-medium">Session</th>
                      <th className="text-left py-3 px-4 font-medium">Score</th>
                      <th className="text-left py-3 px-4 font-medium">Correct</th>
                      <th className="text-left py-3 px-4 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetchingStats ? (
                      [1,2,3].map(i => <tr key={i} className="border-b border-white/5">{[1,2,3,4,5].map(j => <td key={j} className="py-3 px-4"><div className="h-4 bg-white/10 rounded animate-pulse" /></td>)}</tr>)
                    ) : !stats?.recentActivity.length ? (
                      <tr className="border-b border-white/5 text-gray-400"><td className="py-3 px-4" colSpan={5}>No activity yet</td></tr>
                    ) : (
                      stats.recentActivity.map((row, i) => (
                        <tr key={i} className="border-b border-white/5 text-gray-300 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">{row.user_display_name}</td>
                          <td className="py-3 px-4 text-gray-400">{row.session_name}</td>
                          <td className="py-3 px-4 font-medium text-indigo-400">{row.total_score}</td>
                          <td className="py-3 px-4 text-emerald-400">{row.correct_count}</td>
                          <td className="py-3 px-4 text-gray-500 text-xs">{row.completed_at ? new Date(row.completed_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'session-manager' && (
          <motion.div key="session-manager" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Session Manager</p>
                <h2 className="text-2xl font-bold text-white mt-1">Current live quiz</h2>
              </div>
              {currentLive && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  {currentLive.room.status === 'started' ? 'Live game in progress' : 'Lobby is open'}
                </span>
              )}
            </div>

            {!currentLive ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
                <p className="text-lg font-semibold text-white">No live session right now</p>
                <p className="text-sm text-gray-400 mt-2">Open a lobby from Question Manager and it will appear here for live control.</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-cyan-500/[0.06] to-transparent p-6">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
                  <div className="space-y-4 flex-1 min-w-0">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-2xl font-bold text-white">{currentLive.session.name}</h3>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                          {currentLive.room.status === 'started' ? 'Started' : 'Waiting room'}
                        </span>
                      </div>
                      <p className="text-gray-400 mt-2">
                        {currentLive.session.description || 'This quiz is live now. Use Session Manager to monitor and control it.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Players</p>
                        <p className="text-2xl font-bold text-white mt-2">{livePlayers.length}</p>
                        <p className="text-xs text-gray-400 mt-1">In the current live session</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Finished</p>
                        <p className="text-2xl font-bold text-white mt-2">{finishedCount}</p>
                        <p className="text-xs text-gray-400 mt-1">Players who reached the end</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Lobby token</p>
                        <p className="text-lg font-mono font-bold text-white mt-2 truncate">
                          {currentLive.room.joinToken ?? 'Not available'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">Only the current live quiz appears here</p>
                      </div>
                    </div>

                    {livePlayers.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <p className="text-sm font-semibold text-white">Live roster</p>
                          <p className="text-xs text-gray-500">{livePlayers.length} connected</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {livePlayers.slice(0, 6).map(([uid, player]) => {
                            const score = (currentLive.room.scores ?? {})[uid];
                            return (
                              <div key={uid} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-white">{player.displayName}</p>
                                  <p className="text-xs text-gray-400">
                                    Joined at {formatClockTime(player.joinedAt)}
                                  </p>
                                </div>
                                <div className="text-right ml-3">
                                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Score</p>
                                  <p className="text-sm font-semibold text-emerald-300">{score?.score ?? 0}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full xl:w-[320px] space-y-3">
                    {liveShareLink && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Invite link</p>
                        <p className="mt-2 break-all font-mono text-sm text-gray-200">{liveShareLink}</p>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => router.push(currentLive.room.status === 'started'
                        ? `/admin/questions/${currentLive.session.id}/observe`
                        : `/admin/questions/${currentLive.session.id}/lobby`)}
                    >
                      {currentLive.room.status === 'started' ? 'Open Session Manager' : 'Manage Live Lobby'}
                    </Button>
                    {currentLive.room.joinToken && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => copyInvite(currentLive)}
                      >
                        {copiedSessionId === currentLive.session.id ? 'Invite Copied' : 'Copy Invite Link'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => router.push(`/admin/questions/${currentLive.session.id}/edit`)}
                    >
                      Edit Live Quiz
                    </Button>
                    {liveSessions.length > 1 && (
                      <p className="text-xs text-amber-300">
                        Showing the most recent live session. {liveSessions.length - 1} other session{liveSessions.length - 1 === 1 ? '' : 's'} are still open in RTDB.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'question-manager' && (
          <motion.div key="question-manager" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Question Manager</p>
                <h2 className="text-2xl font-bold text-white mt-1">Create quizzes and open lobbies</h2>
              </div>
              <Link href="/admin/questions/create">
                <Button variant="secondary">New Quiz</Button>
              </Link>
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loadingData ? (
                [1,2,3].map(i => <div key={i} className="rounded-2xl border border-white/5 bg-white/5 p-6 animate-pulse h-48"/>)
              ) : sessions.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
                  <p className="text-gray-400">No quizzes yet. Create your first one!</p>
                </div>
              ) : sessions.map(s => (
                <div
                  key={s.id}
                  className={`rounded-2xl border overflow-hidden flex flex-col group transition-colors ${
                    currentLive?.session.id === s.id
                      ? 'border-emerald-500/40 bg-emerald-500/[0.07]'
                      : 'border-white/10 bg-white/5 hover:border-emerald-500/50'
                  }`}
                >
                  {s.cover_image_url && (
                    <div className="h-32 overflow-hidden">
                      <img src={s.cover_image_url} alt={s.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-6 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{s.name}</h3>
                        {currentLive?.session.id === s.id && (
                          <p className="text-xs text-emerald-300 mt-1">Visible now in Session Manager</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${s.is_published ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-300'}`}>
                          {s.is_published ? 'Published' : 'Draft'}
                        </span>
                        <button
                          onClick={() => handleToggleStatus(s.id, s.is_published)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${s.is_published ? 'bg-emerald-500' : 'bg-gray-600'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.is_published ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">{s.description || 'No description.'}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>❓ {s.question_count || 0} nodes</span>
                      <span>👥 {s.play_count || 0} players</span>
                      <span>📈 {s.avg_score || 0} avg pts</span>
                    </div>
                  </div>
                  <div className="bg-black/20 p-4 border-t border-white/5 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" className="flex-1" onClick={() => router.push(`/admin/questions/${s.id}/lobby`)}>
                      {currentLive?.session.id === s.id ? 'Manage Lobby' : 'Create Lobby'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/admin/questions/${s.id}/edit`)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(s.id, false)}>
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      onClick={() => handleDelete(s.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </motion.div>
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
