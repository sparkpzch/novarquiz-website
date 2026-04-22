'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchRoom, leaveWaitingRoom, type SessionRoom } from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';

export default function PlayerLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [sessionName, setSessionName] = useState('');

  // Fetch session name for display
  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setSessionName(s.name); });
  }, [sessionId]);

  // Watch RTDB room — navigate when host starts
  useEffect(() => {
    const unsubscribe = watchRoom(sessionId, (data) => {
      setRoom(data);
      if (data?.status === 'started') {
        router.push(`/play/${sessionId}/question`);
      }
    });
    return unsubscribe;
  }, [sessionId, router]);

  // Clean up on unmount (onDisconnect in RTDB handles it even on crash)
  useEffect(() => {
    return () => {
      if (user) leaveWaitingRoom(sessionId, user.uid);
    };
  }, [sessionId, user]);

  if (loading || !user) return null;

  const players = Object.entries(room?.players ?? {});

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Waiting for host
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{sessionName || '…'}</h1>
          <p className="text-gray-400 text-sm">The game will start when the host is ready</p>
        </motion.div>

        {/* Player count */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">Players in lobby</span>
            <span className="text-2xl font-bold text-white">{players.length}</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            <AnimatePresence>
              {players.map(([uid, player]) => (
                <motion.div
                  key={uid}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className={`flex items-center gap-3 py-2 px-3 rounded-xl ${uid === user.uid ? 'bg-indigo-500/15 border border-indigo-500/25' : 'bg-white/5'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {player.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-white text-sm font-medium flex-1 truncate">{player.displayName}</span>
                  {uid === user.uid && (
                    <span className="text-xs text-indigo-400 font-medium">You</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {players.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">No players yet</p>
            )}
          </div>
        </motion.div>

        {/* Waiting indicator */}
        <div className="flex items-center justify-center gap-3 text-gray-500 text-sm">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span>Waiting for host to start the game…</span>
        </div>
      </div>
    </div>
  );
}
