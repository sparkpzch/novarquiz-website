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
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{session?.name ?? '…'}</h1>
          <p className="text-gray-400 text-sm mt-1">Waiting room · {players.length} player{players.length !== 1 ? 's' : ''} joined</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">Live</span>
        </div>
      </div>

      {/* Access info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Join token (RTDB-based) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Join Token</p>
          <p className="text-sm font-mono font-bold text-white truncate">
            {shareLink ? shareLink.split('/join/')[1]?.split('?')[0] ?? '—' : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-2">🌐 Public — share the link below to invite players</p>
        </div>

        {/* Share link */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Share Link</p>
          <p className="text-sm text-gray-300 truncate mb-3 font-mono">{shareLink || '—'}</p>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-sm font-medium hover:bg-indigo-600/30 transition-colors"
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
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Players</h2>
          <span className="text-xs text-gray-500">{players.length} waiting</span>
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
                  <p className="text-gray-500 text-xs">
                    Joined at {formatJoinTime(player.joinedAt)}
                  </p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" title="Online" />
              </motion.div>
            ))}
          </AnimatePresence>

          {players.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-500">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-sm">Share the link or PIN to invite players</p>
            </div>
          )}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={starting || players.length === 0}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20"
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
        <p className="text-center text-xs text-gray-500">Waiting for at least one player to join before starting</p>
      )}

      <p className="text-center text-xs text-gray-500">
        You are observing as the admin — players join via the link/PIN above.
      </p>
    </div>
  );
}
