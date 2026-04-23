'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchRoom, leaveWaitingRoom, startRoom, type SessionRoom } from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';
import type { QuestionSession } from '@/lib/types';

function PlayerAvatar({ displayName, photoURL, size = 16 }: { displayName: string; photoURL: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = `w-${size} h-${size}`;

  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ fontSize: size * 2.5 }}>
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function PlayerLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [session, setSession] = useState<QuestionSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setSession(s); });
  }, [sessionId]);

  useEffect(() => {
    const unsubscribe = watchRoom(sessionId, (data) => {
      setRoom(data);
      if (data?.status === 'started') {
        router.push(`/play/${sessionId}/question`);
      }
    });
    return unsubscribe;
  }, [sessionId, router]);

  // Warn on browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Clean up player slot on unmount
  useEffect(() => {
    return () => { if (user) leaveWaitingRoom(sessionId, user.uid); };
  }, [sessionId, user]);

  const handleLeave = useCallback(async () => {
    if (user) await leaveWaitingRoom(sessionId, user.uid);
    router.push('/');
  }, [sessionId, user, router]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startRoom(sessionId);
    } catch {
      setStarting(false);
    }
  };

  if (loading || !user) return null;

  const players = Object.entries(room?.players ?? {});

  const isLeader = session?.is_private
    ? user.uid === session.created_by
    : user.uid === room?.leaderId;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Leave confirmation modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 text-center"
            >
              <div className="text-4xl mb-3">🚪</div>
              <h2 className="text-lg font-bold text-white mb-1">Leave the waiting room?</h2>
              <p className="text-gray-400 text-sm mb-6">You'll be removed from the lobby and miss the game when it starts.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={handleLeave}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live lobby
              </div>
              <h1 className="text-3xl font-bold text-white">{session?.name || '…'}</h1>
              <p className="text-gray-400 text-sm mt-1">
                {players.length} player{players.length !== 1 ? 's' : ''} in lobby
                {session?.is_private && <span className="ml-2 text-amber-400">· Private</span>}
              </p>
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="mt-1 px-3 py-1.5 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:border-white/20 transition-colors"
            >
              Leave
            </button>
          </div>
        </motion.div>

        {/* Kahoot-style player grid */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 mb-4 min-h-[200px]"
        >
          {players.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-sm">Waiting for players to join…</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
              <AnimatePresence>
                {players.map(([uid, player], i) => {
                  const isMe = uid === user.uid;
                  const isThisLeader = session?.is_private
                    ? uid === session.created_by
                    : uid === room?.leaderId;

                  return (
                    <motion.div
                      key={uid}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div className={`relative rounded-full ${isMe ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent' : ''}`}>
                        <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} size={14} />
                        {isThisLeader && (
                          <span className="absolute -top-1 -right-1 text-sm" title="Leader">👑</span>
                        )}
                      </div>
                      <span className="text-white text-xs font-medium text-center leading-tight max-w-full truncate px-1">
                        {isMe ? 'You' : player.displayName}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Start button (leader only) */}
        {isLeader ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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
              <p className="text-center text-xs text-gray-500 mt-2">Waiting for at least one player to join</p>
            )}
          </motion.div>
        ) : (
          <div className="flex items-center justify-center gap-3 text-gray-500 text-sm">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span>Waiting for the leader to start the game…</span>
          </div>
        )}
      </div>
    </div>
  );
}
