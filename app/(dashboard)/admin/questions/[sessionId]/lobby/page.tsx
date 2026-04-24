'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { reopenLobby, startRoom, watchRoom, openLobby, closeLobby, type SessionRoom } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';

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
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function formatJoinTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HostLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [session, setSession] = useState<Quiz | null>(null);
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinToken, setJoinToken] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.push('/');
  }, [loading, isAdmin, router]);

  // Fetch session metadata
  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(s => setSession(s));
  }, [sessionId]);

  // Reset RTDB room (clears stale state from prior games), mint a fresh join token,
  // and subscribe to room state.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await reopenLobby(sessionId, user.uid);
      const token = await openLobby(sessionId);
      if (!cancelled) {
        setJoinToken(token);
        trackEvent('session_lobby_opened', { session_id: sessionId });
      }
    })();
    const unsubscribe = watchRoom(sessionId, setRoom);
    return () => { cancelled = true; unsubscribe(); };
  }, [sessionId, user]);

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
      // Invalidate the join URL once the game is rolling — no late-joiners.
      await closeLobby(sessionId);
      trackEvent('session_started', { session_id: sessionId, player_count: players.length });
      showToast('Game started!', 'success');
      router.push(`/admin/questions/${sessionId}/observe`);
    } catch {
      showToast('Failed to start game', 'error');
      setStarting(false);
    }
  };

  if (loading || !isAdmin) return null;

  const players = Object.entries(room?.players ?? {});

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#92BFFF]">Host Lobby</p>
          <h1 className="text-2xl font-bold text-white mt-1">{session?.name ?? '…'}</h1>
          <p className="text-[#92BFFF]/70 text-sm mt-1">
            {players.length} player{players.length !== 1 ? 's' : ''} waiting
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">Live</span>
        </div>
      </div>

      {/* PIN + Share link */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#92BFFF]/20 bg-[#0460A9]/20 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[#92BFFF] mb-2">Join PIN</p>
          <p className="text-3xl font-mono font-bold text-white tracking-widest">
            {joinToken ? joinToken.toUpperCase().slice(0, 6) : '——'}
          </p>
          <p className="text-xs text-[#92BFFF]/60 mt-2 font-mono break-all">{joinToken ?? '—'}</p>
        </div>

        <div className="rounded-2xl border border-[#92BFFF]/20 bg-[#0460A9]/20 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[#92BFFF] mb-2">Share Link</p>
          <p className="text-sm text-[#92BFFF]/80 break-all mb-3 font-mono leading-relaxed">{shareLink || '—'}</p>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0460A9]/40 border border-[#92BFFF]/30 text-[#92BFFF] text-sm font-medium hover:bg-[#0460A9]/60 transition-colors"
          >
            {copied ? (
              <><span>✓</span> Copied!</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Link</>
            )}
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="rounded-2xl border border-[#92BFFF]/15 bg-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#92BFFF]/10 flex items-center justify-between bg-[#0460A9]/10">
          <h2 className="text-sm font-semibold text-white">Players in lobby</h2>
          <span className="text-xs text-[#92BFFF]">{players.length} waiting</span>
        </div>

        <div className="divide-y divide-white/5 min-h-[120px]">
          <AnimatePresence>
            {players.map(([uid, player]) => (
              <motion.div
                key={uid}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-5 py-3"
              >
                <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{player.displayName}</p>
                  <p className="text-[#92BFFF]/60 text-xs">
                    Joined at {formatJoinTime(player.joinedAt)}
                  </p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" title="Online" />
              </motion.div>
            ))}
          </AnimatePresence>

          {players.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-[#92BFFF]/50">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-sm">Share the PIN or link to invite players</p>
            </div>
          )}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={starting || players.length === 0}
        className="w-full py-4 rounded-2xl bg-linear-to-r from-[#055A9E] to-[#0460A9] text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0460A9] hover:to-[#92BFFF]/80 transition-all shadow-lg shadow-[#0460A9]/30"
      >
        {starting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Starting…
          </span>
        ) : (
          `🚀 Start Game (${players.length} player${players.length !== 1 ? 's' : ''})`
        )}
      </button>

      {players.length === 0 && (
        <p className="text-center text-xs text-[#92BFFF]/50">Waiting for at least one player to join before starting</p>
      )}

      <p className="text-center text-xs text-[#92BFFF]/40">
        You are observing as the admin — players join via the link or PIN above.
      </p>
    </div>
  );
}
