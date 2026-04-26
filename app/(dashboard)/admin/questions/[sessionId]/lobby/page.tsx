'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { startRoom, watchRoom, endRoom, closeLobby, type PlayerScore, type SessionRoom } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import { ROOM_STATUS, SESSION_STATUS } from '@/lib/constants/session';
import { motion, AnimatePresence } from 'motion/react';
import type { Session } from '@/lib/types';

function PlayerAvatar({ displayName, photoURL }: { displayName: string; photoURL: string | null }) {
  const [imgError, setImgError] = useState(false);
  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-linear-to-br from-angular-700 to-angular-500 flex items-center justify-center text-white font-bold flex-shrink-0">
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function formatJoinTime(timestamp: number | null) {
  if (!timestamp) return 'Joined recently';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type LobbyPlayer = {
  uid: string;
  displayName: string;
  photoURL: string | null;
  joinedAt: number | null;
  score: number;
  currentQuestionLabel: string | null;
  finished: boolean;
  updatedAt: number | null;
};

function mergeLobbyPlayers(room: SessionRoom | null): LobbyPlayer[] {
  const players = room?.players ?? {};
  const scores = room?.scores ?? {};
  const allIds = new Set([...Object.keys(players), ...Object.keys(scores)]);

  return Array.from(allIds)
    .map((uid) => {
      const player = players[uid];
      const score = scores[uid] as PlayerScore | undefined;
      return {
        uid,
        displayName: score?.displayName || player?.displayName || 'Anonymous',
        photoURL: score?.photoURL ?? player?.photoURL ?? null,
        joinedAt: player?.joinedAt ?? null,
        score: score?.score ?? 0,
        currentQuestionLabel: score?.currentQuestionLabel ?? null,
        finished: score?.finished ?? false,
        updatedAt: score?.updatedAt ?? null,
      };
    })
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? 1 : -1;
      if (a.score !== b.score) return b.score - a.score;
      return (a.joinedAt ?? 0) - (b.joinedAt ?? 0);
    });
}

function statusLabel(status: SessionRoom['status'] | undefined) {
  if (status === ROOM_STATUS.STARTED) return 'Started';
  if (status === ROOM_STATUS.ENDED) return 'Ended';
  return 'Waiting';
}

export default function HostLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [neonLeaderboard, setNeonLeaderboard] = useState<any[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinToken, setJoinToken] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.push('/');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Session | null) => setSession(s));
  }, [sessionId]);

  useEffect(() => {
    if (!session?.id) return;
    const fetchLeaderboard = () => {
      fetch(`/api/sessions/${session.id}/leaderboard`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setNeonLeaderboard(data));
    };
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id) return;
    const unsubscribe = watchRoom(session.id, (nextRoom) => {
      setRoom(nextRoom);
      setJoinToken(nextRoom?.joinToken ?? null);
    });
    return unsubscribe;
  }, [session?.id]);

  useEffect(() => {
    if (session?.slug && sessionId !== session.slug) {
      router.replace(`/admin/questions/${session.slug}/lobby`);
    }
  }, [session, sessionId, router]);

  useEffect(() => {
    if (joinToken) {
      trackEvent('session_lobby_opened', { session_id: sessionId });
    }
  }, [joinToken, sessionId]);

  const shareLink = typeof window !== 'undefined' && joinToken
    ? `${window.location.origin}/join/${joinToken}`
    : '';

  const copyLink = useCallback(async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startRoom(sessionId);
      // Sync with Postgres
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SESSION_STATUS.STARTED }),
      });
      trackEvent('session_started', { session_id: sessionId, player_count: mergedPlayers.length });
      showToast('Game started!', 'success');
    } catch {
      showToast('Failed to start game', 'error');
      setStarting(false);
      return;
    }
    setStarting(false);
  };

  const handleClose = async () => {
    try {
      if (roomStatus === ROOM_STATUS.STARTED) {
        if (!confirm('Are you sure you want to end this game?')) return;
        await endRoom(sessionId);
      }
      
      await closeLobby(sessionId);
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SESSION_STATUS.CLOSED, pin: null }),
      });
      
      showToast('Session closed', 'success');
      router.push('/admin?tab=quizzes-manager');
    } catch (error) {
      console.error('Close failed:', error);
      showToast('Failed to close session', 'error');
    }
  };

  const handleAnalytic = () => {
    router.push(`/admin/sessions/${sessionId}/analytics`);
  };

  useEffect(() => {
    if (session?.name) {
      document.title = `${session.name} | Host Lobby`;
    }
  }, [session?.name]);

  if (loading || !isAdmin) return null;

  const mergedPlayers = mergeLobbyPlayers(room);
  
  const combinedLeaderboard = (() => {
    const map = new Map<string, LobbyPlayer>();
    
    // 1. Start with live RTDB players
    mergedPlayers.forEach(p => map.set(p.uid, p));
    
    // 2. Add/Merge Neon persistent leaderboard entries
    neonLeaderboard.forEach(n => {
      const existing = map.get(n.user_id);
      if (existing) {
        // If live player has lower score than persistent (rare but possible during sync), use persistent
        if (n.total_score > existing.score) {
          existing.score = n.total_score;
          existing.finished = true;
        }
      } else {
        map.set(n.user_id, {
          uid: n.user_id,
          displayName: n.user_display_name,
          photoURL: n.user_photo_url,
          score: n.total_score,
          finished: true,
          joinedAt: null,
          currentQuestionLabel: null,
          updatedAt: new Date(n.completed_at).getTime()
        });
      }
    });
    
    return Array.from(map.values()).sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
    });
  })();

  const leaderboardToDisplay = combinedLeaderboard.filter(p => p.score > 0 || p.finished);
  const roomStatus = room?.status ?? ROOM_STATUS.WAITING;
  const finishedCount = combinedLeaderboard.filter((player) => player.finished).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#92BFFF]">Host Lobby</p>
          <h1 className="text-2xl font-bold text-white mt-1">{session?.name ?? 'Loading...'}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm">
            <p className="text-[#92BFFF]/70">
              {mergedPlayers.length} player{mergedPlayers.length !== 1 ? 's' : ''} connected
            </p>
            {session?.question_count !== undefined && (
              <>
                <span className="text-white/20">•</span>
                <p className="text-[#92BFFF]/70">
                  {session.question_count} Questions
                </p>
              </>
            )}
          </div>
          {session?.description && (
            <p className="text-[#92BFFF]/50 text-sm mt-2 max-w-lg line-clamp-2">
              {session.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {roomStatus === ROOM_STATUS.WAITING && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-5 py-2 rounded-xl bg-linear-to-r from-[#055A9E] to-[#0460A9] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0460A9] hover:to-[#92BFFF]/80 transition-all shadow-lg shadow-[#0460A9]/30"
              >
                {starting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting...
                  </span>
                ) : (
                  `Start Game (${mergedPlayers.length})`
                )}
              </button>
            )}

            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold hover:bg-rose-500/20 transition-all"
            >
              {roomStatus === ROOM_STATUS.STARTED ? 'End Game' : 'Close Lobby'}
            </button>
            <button
              onClick={handleAnalytic}
              className="px-4 py-2 rounded-xl bg-[#0460A9]/20 border border-[#0460A9]/30 text-[#92BFFF] text-sm font-semibold hover:bg-[#0460A9]/30 transition-all"
            >
              Analytic
            </button>
          </div>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            roomStatus === ROOM_STATUS.STARTED
              ? 'bg-amber-500/20 border-amber-500/30'
              : roomStatus === ROOM_STATUS.ENDED
                ? 'bg-slate-500/20 border-slate-400/30'
                : 'bg-emerald-500/20 border-emerald-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${
              roomStatus === ROOM_STATUS.STARTED
                ? 'bg-amber-400'
                : roomStatus === ROOM_STATUS.ENDED
                  ? 'bg-slate-300'
                  : 'bg-emerald-400'
            }`} />
            <span className={`text-xs font-medium ${
              roomStatus === ROOM_STATUS.STARTED
                ? 'text-amber-300'
                : roomStatus === ROOM_STATUS.ENDED
                  ? 'text-slate-200'
                  : 'text-emerald-400'
            }`}>
              {statusLabel(roomStatus)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#92BFFF]/20 bg-[#0460A9]/20 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-[#92BFFF] mb-2">PIN</p>
              <p className="text-2xl font-mono font-bold text-white break-all">
                {joinToken ?? 'Loading...'}
              </p>
              <p className="text-xs text-[#92BFFF]/60 mt-2">
                Players can paste this PIN into the join box.
              </p>
            </div>

            <div className="rounded-2xl border border-[#92BFFF]/20 bg-[#0460A9]/20 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-[#92BFFF] mb-2">Share Link</p>
              <p className="text-sm text-[#92BFFF]/80 break-all mb-3 font-mono leading-relaxed">{shareLink || '—'}</p>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0460A9]/40 border border-[#92BFFF]/30 text-[#92BFFF] text-sm font-medium hover:bg-[#0460A9]/60 transition-colors"
              >
                {copied ? (
                  <><span>OK</span> Copied!</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Link</>
                )}
              </button>
            </div>
          </div>

          {roomStatus === ROOM_STATUS.WAITING && (
            <div className="rounded-2xl border border-[#92BFFF]/15 bg-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#92BFFF]/10 flex items-center justify-between bg-[#0460A9]/10">
                <h2 className="text-sm font-semibold text-white">Players</h2>
                <span className="text-xs text-[#92BFFF]">
                  {mergedPlayers.length} connected · {finishedCount} finished
                </span>
              </div>

              <div className="divide-y divide-white/5 min-h-[120px]">
                <AnimatePresence>
                  {mergedPlayers.map((player) => (
                    <motion.div
                      key={player.uid}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium truncate">{player.displayName}</p>
                          {player.finished && (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Finished
                            </span>
                          )}
                          {roomStatus === ROOM_STATUS.STARTED && !player.finished && player.currentQuestionLabel && (
                            <span className="rounded-full bg-[#92BFFF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#CFE3FF]">
                              {player.currentQuestionLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[#92BFFF]/60 text-xs">
                          {player.currentQuestionLabel && roomStatus !== ROOM_STATUS.WAITING
                            ? `Live score ${player.score}`
                            : `Joined at ${formatJoinTime(player.joinedAt)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#92BFFF]/55">Score</p>
                        <p className="text-sm font-bold text-white">{player.score}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {mergedPlayers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-[#92BFFF]/50">
                    <span className="text-3xl mb-2">Lobby</span>
                    <p className="text-sm">Share the invite link to invite players</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-[#92BFFF]/15 bg-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#92BFFF]/10 flex items-center justify-between bg-[#0460A9]/10">
              <h2 className="text-sm font-semibold text-white">Leaderboard</h2>
              <span className="text-xs text-[#92BFFF]">{leaderboardToDisplay.length} entries</span>
            </div>
            <div className="p-4 space-y-3">
              {leaderboardToDisplay.length === 0 ? (
                <p className="text-sm text-[#92BFFF]/60">Scores will appear here after the game starts.</p>
              ) : (
                leaderboardToDisplay.map((player, index) => (
                  <div
                    key={player.uid}
                    className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/5 px-3 py-3"
                  >
                    <div className="w-6 text-center text-sm font-bold text-[#92BFFF]">{index + 1}</div>
                    <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{player.displayName}</p>
                      <p className="text-xs text-[#92BFFF]/60">
                        {player.finished
                          ? 'Finished'
                          : player.currentQuestionLabel
                            ? `On ${player.currentQuestionLabel}`
                            : 'In game'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-[#CFE3FF]">{player.score}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {mergedPlayers.length === 0 && roomStatus === ROOM_STATUS.WAITING && (
            <p className="text-center text-xs text-[#92BFFF]/50">Wait for players to join before starting.</p>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-[#92BFFF]/40">
        Admin lobby stays live while players join and while the game is running.
      </p>
    </div>
  );
}
