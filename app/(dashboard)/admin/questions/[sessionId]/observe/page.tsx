'use client';

// Admin observation grid: live-monitors players while a session is in progress.
// Subscribes to RTDB `sessions/{sessionId}/scores/{uid}` which each client writes
// to as it views/answers questions. Renders a grid of avatars with the current
// question label + running score, plus a "done ✓" badge on finish.

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchScores, endRoom, type PlayerScore } from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';

function Avatar({ displayName, photoURL, size = 48 }: { displayName: string; photoURL: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  if (photoURL && !err) {
    return <img src={photoURL} alt={displayName} width={size} height={size} className="rounded-full object-cover flex-shrink-0" onError={() => setErr(true)} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-[var(--nq-primary)] flex items-center justify-center text-white font-bold flex-shrink-0"
    >
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function ObservePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [session, setSession] = useState<Quiz | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) router.push('/');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`).then(r => r.ok ? r.json() : null).then(setSession);
  }, [sessionId]);

  useEffect(() => {
    return watchScores(sessionId, setScores);
  }, [sessionId]);

  if (loading || !isAdmin) return null;

  const players = Object.entries(scores).sort(([, a], [, b]) => b.score - a.score);
  const finished = players.filter(([, s]) => s.finished).length;
  const total = players.length;

  const handleEnd = async () => {
    setEnding(true);
    try {
      await endRoom(sessionId);
      router.push('/admin?tab=session-manager');
    } catch { setEnding(false); }
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · Observing
          </div>
          <h1 className="text-3xl font-bold text-white">{session?.name ?? '…'}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} player{total !== 1 ? 's' : ''} · {finished} finished
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/history?session=${sessionId}`)}
            className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors"
          >
            Leaderboard
          </button>
          <button
            onClick={handleEnd}
            disabled={ending}
            className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50"
          >
            {ending ? 'Ending…' : 'End Game'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {total === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/5 p-10 text-center">
          <p className="text-gray-400">No players yet. Waiting for them to start answering…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {players.map(([uid, p], i) => (
              <motion.div
                key={uid}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03 }}
                className={`relative rounded-xl border p-4 flex items-center gap-4 ${p.finished ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}
              >
                <Avatar displayName={p.displayName} photoURL={p.photoURL ?? null} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold truncate">{p.displayName}</p>
                    {i === 0 && !p.finished && <span className="text-xs">👑</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {p.finished ? (
                      <span className="text-emerald-400">✓ Finished</span>
                    ) : p.currentQuestionLabel ? (
                      <>📍 {p.currentQuestionLabel}</>
                    ) : (
                      <span className="text-gray-600">Waiting…</span>
                    )}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Score</p>
                  <p className="text-indigo-400 font-bold text-lg tabular-nums">{p.score}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
