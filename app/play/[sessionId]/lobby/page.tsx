'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchRoom, leaveWaitingRoom, type SessionRoom } from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

function PlayerChip({
  displayName,
  photoURL,
  highlighted,
  crowned,
}: {
  displayName: string;
  photoURL: string | null;
  highlighted?: boolean;
  crowned?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2"
    >
      <div className={`relative rounded-full ${highlighted ? 'ring-4 ring-[#92BFFF]' : ''}`}>
        <ProfileAvatar displayName={displayName} photoURL={photoURL} size={64} />
        {crowned && <span className="absolute -right-1 -top-2 text-lg">👑</span>}
      </div>
      <p className="max-w-[88px] truncate text-center text-sm font-semibold text-[#16324F]">{displayName}</p>
    </motion.div>
  );
}

export default function PlayerLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [session, setSession] = useState<Quiz | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setSession(data); });
  }, [sessionId]);

  useEffect(() => {
    const unsubscribe = watchRoom(sessionId, (data) => {
      setRoom(data);
      if (data?.status === 'started') {
        router.push(`/play/${sessionId}/question`);
      }
    });
    return unsubscribe;
  }, [router, sessionId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (user) leaveWaitingRoom(sessionId, user.uid);
    };
  }, [sessionId, user]);

  const handleLeave = useCallback(async () => {
    if (user) await leaveWaitingRoom(sessionId, user.uid);
    router.push('/');
  }, [router, sessionId, user]);

  if (loading || !user) return null;

  const players = Object.entries(room?.players ?? {});

  return (
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-3xl space-y-4">
          <AnimatePresence>
            {showLeaveConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#08122A]/45 p-4 backdrop-blur-md"
              >
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.98 }}
                  className="nq-card w-full max-w-sm rounded-[30px] p-6 text-center"
                >
                  <div className="text-4xl">🚪</div>
                  <h2 className="mt-3 text-xl font-bold text-[#16324F]">Leave this lobby?</h2>
                  <p className="mt-2 text-sm text-[#5D7EA1]">You&apos;ll be removed before the host starts the game.</p>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="flex-1 rounded-2xl border border-[#0460A9]/12 bg-white px-4 py-3 text-sm font-semibold text-[#16324F]"
                    >
                      Stay
                    </button>
                    <button
                      onClick={handleLeave}
                      className="flex-1 rounded-2xl bg-[#0E173A] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Leave
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="nq-card rounded-[34px] p-6 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Waiting Lobby</p>
                <h1 className="mt-2 text-3xl font-bold text-[#16324F]">{session?.name || 'Loading…'}</h1>
                <p className="mt-2 text-sm text-[#5D7EA1]">{players.length} player{players.length !== 1 ? 's' : ''} joined. The host will move everyone into the quiz when ready.</p>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-2xl border border-[#0460A9]/12 bg-white px-4 py-3 text-sm font-semibold text-[#16324F]"
              >
                Leave
              </button>
            </div>

            <div className="mt-6 rounded-[28px] bg-white/70 p-5">
              {players.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <div className="text-4xl">👥</div>
                  <p className="mt-3 text-base font-semibold text-[#16324F]">Waiting for players to join…</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
                  {players.map(([uid, player]) => (
                    <PlayerChip
                      key={uid}
                      displayName={uid === user.uid ? 'You' : player.displayName}
                      photoURL={player.photoURL}
                      highlighted={uid === user.uid}
                      crowned={uid === room?.leaderId}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-center gap-3 rounded-[22px] bg-[#0E173A] px-4 py-3 text-sm text-white">
              <div className="flex gap-1">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#92BFFF]"
                    style={{ animationDelay: `${index * 0.12}s` }}
                  />
                ))}
              </div>
              <span>Waiting for the host to start the quiz…</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
