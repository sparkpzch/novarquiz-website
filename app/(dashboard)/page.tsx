'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { createTeamRoom, resolveJoinToken, trackUserSession, watchUserSessions, type UserSessionEntry } from '@/lib/firebase/rtdb';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';

type ParsedJoinInput =
  | { type: 'token'; token: string }
  | { type: 'team'; sessionId: string; roomId: string; pin: string }
  | null;

// Parse a raw token string or a pasted invite URL.
// Handles:
//   /join/<token>                             → lobby join via token
//   /play/<sessionId>/team/<roomId>?pin=<pin> → team room direct join
function parseJoinInput(input: string): ParsedJoinInput {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const teamMatch = u.pathname.match(/\/play\/([^/]+)\/team\/([^/?#]+)/);
    if (teamMatch) {
      const pin = u.searchParams.get('pin') ?? '';
      return { type: 'team', sessionId: teamMatch[1], roomId: teamMatch[2], pin };
    }
    const joinMatch = u.pathname.match(/\/join\/([^/?#]+)/);
    if (joinMatch) return { type: 'token', token: joinMatch[1] };
  } catch { /* not a URL */ }
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed)) return { type: 'token', token: trimmed };
  return null;
}

function LiveSessionsWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, UserSessionEntry>>({});

  useEffect(() => {
    if (!user) return;
    return watchUserSessions(user.uid, setEntries);
  }, [user]);

  const list = Object.values(entries).sort((a, b) => b.joinedAt - a.joinedAt);
  if (list.length === 0) return null;

  const resume = (entry: UserSessionEntry) => {
    if (entry.mode === 'team' && entry.roomId) {
      router.push(`/play/${entry.sessionId}/team/${entry.roomId}`);
    } else {
      router.push(`/play/${entry.sessionId}/lobby`);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Live sessions</h3>
        <span className="text-xs text-gray-400">· {list.length} active</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((entry, i) => {
          const id = entry.roomId ? `${entry.sessionId}__${entry.roomId}` : entry.sessionId;
          return (
            <motion.button
              key={id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => resume(entry)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-emerald-500/30 p-3 text-left transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">{entry.mode === 'team' ? '👥' : '🎮'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{entry.sessionName}</p>
                <p className="text-xs text-gray-400 capitalize">{entry.mode === 'team' ? 'Team room' : 'Public lobby'} · Resume →</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function JoinByCodeCard() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleJoin = async () => {
    const parsed = parseJoinInput(code);
    if (!parsed) {
      showToast('Enter a valid invite code or link', 'error');
      return;
    }
    if (!user) {
      if (parsed.type === 'token') {
        router.push(`/sign-in?next=/join/${parsed.token}`);
      } else {
        router.push(`/sign-in?next=/play/${parsed.sessionId}/team/${parsed.roomId}?pin=${parsed.pin}`);
      }
      return;
    }
    setBusy(true);
    if (parsed.type === 'team') {
      router.push(`/play/${parsed.sessionId}/team/${parsed.roomId}?pin=${parsed.pin}`);
      return;
    }
    try {
      const sessionId = await resolveJoinToken(parsed.token);
      if (!sessionId) {
        showToast('That invite link has expired. Ask the host for a new one.', 'error');
        setBusy(false);
        return;
      }
    } catch { /* swallow — let /join/{token} handle it */ }
    router.push(`/join/${parsed.token}`);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-600/10 to-purple-600/10 p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">🎟️</span>
        <div>
          <p className="text-white font-semibold">Have an invite?</p>
          <p className="text-xs text-gray-400">Paste a join code or link from the host</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && handleJoin()}
          placeholder="Code or invite link"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white text-sm focus:border-indigo-500 focus:outline-none placeholder:text-gray-500"
        />
        <button
          onClick={handleJoin}
          disabled={busy || !code.trim()}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-500 hover:to-purple-500 transition-all"
        >
          {busy ? '…' : 'Join'}
        </button>
      </div>
    </div>
  );
}

function SoloOrTeamModal({
  session,
  onClose,
}: {
  session: Quiz;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [creatingTeam, setCreatingTeam] = useState(false);

  const handleSolo = () => {
    onClose();
    router.push(`/play/${session.id}`);
  };

  const handleTeam = async () => {
    if (!user) {
      showToast('Please sign in to host a team room', 'error');
      return;
    }
    setCreatingTeam(true);
    try {
      const { roomId } = await createTeamRoom(session.id, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
      await trackUserSession(user.uid, {
        sessionId: session.id,
        sessionName: session.name,
        mode: 'team',
        roomId,
        joinedAt: Date.now(),
      });
      onClose();
      router.push(`/play/${session.id}/team/${roomId}`);
    } catch (err) {
      console.error('createTeamRoom failed:', err);
      showToast(`Could not create team room: ${(err as Error).message || 'unknown error'}`, 'error');
      setCreatingTeam(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 16 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5">
          <h2 className="text-lg font-bold text-white mb-1">{session.name}</h2>
          <p className="text-gray-400 text-sm">How do you want to play?</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSolo}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-indigo-600/15 hover:border-indigo-500/40 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:bg-indigo-500/30 transition-colors">
              🎮
            </div>
            <div>
              <p className="text-white font-semibold">Solo</p>
              <p className="text-gray-400 text-sm">Play by yourself at your own pace</p>
            </div>
          </button>

          <button
            onClick={handleTeam}
            disabled={creatingTeam}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-purple-600/15 hover:border-purple-500/40 transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:bg-purple-500/30 transition-colors">
              {creatingTeam ? (
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : '👥'}
            </div>
            <div>
              <p className="text-white font-semibold">Team</p>
              <p className="text-gray-400 text-sm">Host a private room — invite friends with PIN</p>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:border-white/20 transition-colors"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

type UserStats = { total_played: number; avg_score: number; best_streak: number };

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Quiz | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  useEffect(() => {
    fetch('/api/questions/sessions').then(r => r.ok ? r.json() : []).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetch(`/api/play/me/history?uid=${encodeURIComponent(user.uid)}`)
      .then(r => r.ok ? r.json() : [])
      .then((history: Array<{ total_score: number; streak: number }>) => {
        if (!history.length) return;
        setUserStats({
          total_played: history.length,
          avg_score: Math.round(history.reduce((s, h) => s + h.total_score, 0) / history.length),
          best_streak: Math.max(...history.map(h => h.streak)),
        });
      })
      .catch(() => {});
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">{t('dashboard.welcome')}, {user?.displayName || 'Player'}! 👋</h1>
        <p className="text-gray-400 mt-1">Ready to test your knowledge?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t('dashboard.total_played'), value: userStats ? String(userStats.total_played) : '—', icon: '🎮', color: 'from-indigo-600 to-purple-600' },
          { label: t('dashboard.avg_score'), value: userStats ? `${userStats.avg_score} pts` : '—', icon: '📊', color: 'from-emerald-600 to-cyan-600' },
          { label: t('dashboard.best_streak'), value: userStats ? String(userStats.best_streak) : '—', icon: '🔥', color: 'from-orange-600 to-red-600' },
        ].map((stat, idx) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
            className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <div className={`w-10 h-1 rounded-full bg-gradient-to-r ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <LiveSessionsWidget />

      <JoinByCodeCard />

      <div>
        <h2 className="text-xl font-semibold text-white mb-4">{t('dashboard.available_quizzes')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-white/5 bg-white/5 p-5 animate-pulse"><div className="h-4 bg-white/10 rounded mb-3 w-3/4" /><div className="h-3 bg-white/5 rounded w-full" /></div>)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
            <p className="text-gray-400 text-lg">🎯 {t('dashboard.no_quizzes')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s, idx) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedSession(s)}
                className="rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 cursor-pointer group overflow-hidden"
              >
                {s.cover_image_url && (
                  <div className="h-36 overflow-hidden">
                    <img src={s.cover_image_url} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">{s.name}</h3>
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-medium flex-shrink-0 ml-2">{s.question_count} Q</span>
                  </div>
                  {s.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{s.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>⏱ Count-up from 0</span>
                    <span>•</span>
                    <span className="group-hover:text-indigo-400 transition-colors">{t('dashboard.join_quiz')} →</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedSession && (
          <SoloOrTeamModal
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
