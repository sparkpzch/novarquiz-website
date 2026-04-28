'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { startRoom, watchRoom, endRoom, closeLobby, openLobby, type PlayerScore, type SessionRoom } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import { ROOM_STATUS, SESSION_STATUS } from '@/lib/constants/session';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'react-qr-code';
import InvitationModal from '@/components/InvitationModal';
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
  const [showQRModal, setShowQRModal] = useState(false);

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
      if (nextRoom) {
        if (nextRoom.joinToken) {
          setJoinToken(nextRoom.joinToken);
        } else {
          // Recover a missing join token so the host can still share the lobby.
          void openLobby(session.id)
            .then((token) => setJoinToken(token))
            .catch(() => {
              setJoinToken(null);
            });
        }
      } else {
        setJoinToken(null);
      }
    });
    return unsubscribe;
  }, [session?.id]);

  useEffect(() => {
    if (session?.slug && sessionId !== session.slug) {
      router.replace(`/admin/questions/${session.slug}/lobby`);
    }
  }, [session, sessionId, router]);

  useEffect(() => {
    if (joinToken && session?.id) {
      trackEvent('session_lobby_opened', { session_id: session.id });
    }
  }, [joinToken, session?.id]);

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
    if (!session) return;
    setStarting(true);
    try {
      await startRoom(session.id);
      // Sync with Postgres
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SESSION_STATUS.STARTED }),
      });
      trackEvent('session_started', { session_id: session.id, player_count: mergedPlayers.length });
      showToast('Game started!', 'success');
    } catch {
      showToast('Failed to start game', 'error');
      setStarting(false);
      return;
    }
    setStarting(false);
  };

  const handleClose = async () => {
    if (!session) return;
    try {
      if (roomStatus === ROOM_STATUS.STARTED) {
        if (!confirm('Are you sure you want to end this game?')) return;
        await endRoom(session.id);
      }
      
      await closeLobby(session.id);
      await fetch(`/api/sessions/${session.id}`, {
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
    if (!session) return;
    router.push(`/admin/sessions/${session.id}/analytics`);
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
    <div className="nq-admin-panel max-w-6xl mx-auto space-y-6">
      <div className="nq-card rounded-[34px] p-6 md:p-8 flex items-center justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="nq-details text-[#5D7EA1]">Host Lobby</p>
          <h1 className="nq-header text-[#16324F] mt-1 truncate">{session?.name ?? 'Loading...'}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm">
            <p className="text-[#5D7EA1]">
              <span className="font-bold text-[#16324F]">{mergedPlayers.length}</span> players connected
            </p>
            {session?.question_count !== undefined && (
              <>
                <span className="text-[#0460A9]/20">•</span>
                <p className="text-[#5D7EA1]">
                  <span className="font-bold text-[#16324F]">{session.question_count}</span> Questions
                </p>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {roomStatus === ROOM_STATUS.WAITING && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-6 py-2.5 rounded-[22px] bg-[#0460A9] hover:bg-[#03508C] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#0460A9]/20 flex items-center gap-2"
              >
                {starting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting...
                  </>
                ) : (
                  `Start Game`
                )}
              </button>
            )}

            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-[22px] bg-white border border-[#E74C3C]/20 text-[#E74C3C] text-sm font-bold hover:bg-[#FDEDEC] transition-all"
            >
              {roomStatus === ROOM_STATUS.STARTED ? 'End Game' : 'Close Lobby'}
            </button>
            <button
              onClick={handleAnalytic}
              className="px-5 py-2.5 rounded-[22px] bg-white border border-[#0460A9]/15 text-[#0460A9] text-sm font-bold hover:bg-[#F8FAFC] transition-all"
            >
              Analytic
            </button>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
            roomStatus === ROOM_STATUS.STARTED
              ? 'bg-[#E67E22]/10 border-[#E67E22]/20'
              : roomStatus === ROOM_STATUS.ENDED
                ? 'bg-[#5D7EA1]/10 border-[#5D7EA1]/20'
                : 'bg-[#0D8C6D]/10 border-[#0D8C6D]/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              roomStatus === ROOM_STATUS.STARTED
                ? 'bg-[#E67E22] animate-pulse'
                : roomStatus === ROOM_STATUS.ENDED
                  ? 'bg-[#5D7EA1]'
                  : 'bg-[#0D8C6D] animate-pulse'
            }`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              roomStatus === ROOM_STATUS.STARTED
                ? 'text-[#E67E22]'
                : roomStatus === ROOM_STATUS.ENDED
                  ? 'text-[#5D7EA1]'
                  : 'text-[#0D8C6D]'
            }`}>
              {statusLabel(roomStatus)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="space-y-6">
          <div className="nq-card rounded-[34px] overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px]">
              <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-[#0460A9]/10 space-y-8">
                {/* PIN Row */}
                <div>
                  <p className="nq-details mb-2">Access PIN</p>
                  <p className="text-4xl sm:text-5xl font-mono font-bold text-[#0460A9] tracking-tighter whitespace-nowrap overflow-hidden">
                    {joinToken ?? '—'}
                  </p>
                  <p className="nq-content text-[#5D7EA1] mt-2">Players can enter this PIN on the join page.</p>
                </div>

                {/* Link Row */}
                <div>
                  <p className="nq-details mb-2">Invitation Link</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 bg-[#F8FAFC] px-4 py-3 rounded-2xl border border-[#0460A9]/5 text-xs font-mono text-[#5D7EA1] truncate">
                      {shareLink || 'Generating link...'}
                    </div>
                    <button
                      onClick={copyLink}
                      className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-[#0460A9]/15 text-[#0460A9] text-sm font-bold hover:bg-[#F8FAFC] transition-all shadow-sm active:scale-95"
                    >
                      {copied ? 'Copied!' : (
                        <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* QR Code Column */}
              <div className="bg-[#0460A9]/[0.02] p-8 flex flex-col items-center justify-center text-center">
                <p className="nq-details mb-4 text-[#5D7EA1]">Scan to Join</p>
                <div
                  onClick={() => setShowQRModal(true)}
                  className="bg-white p-3 rounded-2xl cursor-pointer hover:scale-105 transition-transform shadow-md border border-[#0460A9]/10 mb-4"
                >
                  {shareLink ? (
                    <QRCode value={shareLink} size={110} level="M" />
                  ) : (
                    <div className="w-[110px] h-[110px] bg-[#F8FAFC] animate-pulse rounded-xl" />
                  )}
                </div>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="text-xs font-bold text-[#0460A9] hover:underline"
                >
                  View Fullscreen QR
                </button>
              </div>
            </div>
          </div>

          {roomStatus === ROOM_STATUS.WAITING && (
            <div className="nq-card rounded-[34px] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#0460A9]/10 flex items-center justify-between bg-[#0460A9]/5">
                <h2 className="nq-topic text-[#16324F]">Players in lobby</h2>
                <span className="nq-details text-[#0460A9]">
                  {mergedPlayers.length} connected · {finishedCount} finished
                </span>
              </div>

              <div className="divide-y divide-[#0460A9]/10 min-h-[140px] bg-white/40">
                <AnimatePresence>
                  {mergedPlayers.map((player) => (
                    <motion.div
                      key={player.uid}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-[#F4F9FF] transition-colors"
                    >
                      <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="nq-subject text-[#16324F] truncate">{player.displayName}</p>
                          {player.finished && (
                            <span className="rounded-full bg-[#0D8C6D]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0D8C6D] uppercase">
                              Finished
                            </span>
                          )}
                        </div>
                        <p className="nq-content text-[#5D7EA1]">
                          {player.currentQuestionLabel && roomStatus !== ROOM_STATUS.WAITING
                            ? `Live score ${player.score}`
                            : `Joined at ${formatJoinTime(player.joinedAt)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="nq-details mb-0.5">Score</p>
                        <p className="text-lg font-bold text-[#0460A9]">{player.score}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {mergedPlayers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-[#5D7EA1]">
                    <div className="w-12 h-12 rounded-full bg-[#0460A9]/5 flex items-center justify-center text-2xl mb-3">👥</div>
                    <p className="nq-topic text-[#16324F]">No players yet</p>
                    <p className="nq-content text-[#5D7EA1] mt-1">Share the link to invite participants</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="nq-card rounded-[34px] overflow-hidden">
            <div className="px-6 py-5 border-b border-[#0460A9]/10 flex items-center justify-between bg-[#0460A9]/5">
              <h2 className="nq-topic text-[#16324F]">Leaderboard</h2>
              <span className="nq-details text-[#0460A9]">{leaderboardToDisplay.length} entries</span>
            </div>
            <div className="p-4 space-y-3 bg-white/40">
              {leaderboardToDisplay.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="nq-content text-[#5D7EA1]">Scores will appear here after the game starts.</p>
                </div>
              ) : (
                leaderboardToDisplay.map((player, index) => (
                  <div
                    key={player.uid}
                    className="flex items-center gap-4 rounded-[22px] border border-[#0460A9]/10 bg-white/70 px-4 py-3 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="w-6 text-center text-sm font-bold text-[#0460A9]">{index + 1}</div>
                    <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} />
                    <div className="min-w-0 flex-1">
                      <p className="nq-subject text-[#16324F] truncate">{player.displayName}</p>
                      <p className="nq-content text-[#5D7EA1]">
                        {player.finished
                          ? 'Finished'
                          : player.currentQuestionLabel
                            ? `On ${player.currentQuestionLabel}`
                            : 'In game'}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-[#0460A9]">{player.score}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {mergedPlayers.length === 0 && roomStatus === ROOM_STATUS.WAITING && (
            <div className="nq-card rounded-[28px] p-8 text-center border-dashed border-[#0460A9]/20 bg-[#0460A9]/5">
              <div className="w-12 h-12 rounded-full bg-[#0460A9]/10 flex items-center justify-center text-2xl mx-auto mb-4">🎮</div>
              <p className="nq-topic text-[#16324F]">Ready to play?</p>
              <p className="nq-content text-[#5D7EA1] mt-2">Wait for players to join before starting the quiz.</p>
              <p className="nq-details mt-4 text-[#0460A9]">Invite players using the PIN or link</p>
            </div>
          )}
        </div>
      </div>

      <InvitationModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        sessionName={session?.name ?? "Session"}
        joinToken={joinToken}
      />
    </div>
  );
}
