'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchRoomStatus, watchRoomPlayers, leaveWaitingRoom, type WaitingPlayer } from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';
import type { Quiz } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

function PlayerChip({
  displayName,
  photoURL,
  highlighted,
}: {
  displayName: string;
  photoURL: string | null;
  highlighted?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2"
    >
      <div className={`relative rounded-full ${highlighted ? 'ring-4 ring-[#92BFFF]' : ''}`}>
        <ProfileAvatar displayName={displayName} photoURL={photoURL} size={64} />
      </div>
      <p className="nq-on-dark max-w-[88px] truncate text-center text-sm font-semibold">{displayName}</p>
    </motion.div>
  );
}

export default function PlayerLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Record<string, WaitingPlayer>>({});
  const [session, setSession] = useState<Quiz | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const joinedUserIdRef = useRef<string | null>(null);
  const shouldLeaveOnUnmountRef = useRef(true);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setSession(data); });
  }, [sessionId]);

  // Only watch status for navigation — players don't need the full room object
  useEffect(() => {
    if (!session?.id) return;
    return watchRoomStatus(session.id, (status) => {
      if (status === 'started') router.push(`/play/${session.id}/question`);
    });
  }, [router, session?.id]);

  // Separate scoped listener for the player grid
  useEffect(() => {
    if (!session?.id) return;
    return watchRoomPlayers(session.id, setPlayers);
  }, [session?.id]);

  useEffect(() => {
    joinedUserIdRef.current = user?.uid ?? null;
  }, [user?.uid]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      const uid = joinedUserIdRef.current;
      if (shouldLeaveOnUnmountRef.current && uid && session?.id) {
        leaveWaitingRoom(session.id, uid);
      }
    };
  }, [session?.id]);

  const handleLeave = useCallback(async () => {
    if (!session) return;
    shouldLeaveOnUnmountRef.current = false;
    if (user) await leaveWaitingRoom(session.id, user.uid);
    router.push('/');
  }, [router, session, user]);

  if (loading || !user) return null;

  const playerEntries = Object.entries(players);

  return (
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-3xl space-y-6">
          <AnimatePresence>
            {showLeaveConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#03305A]/40 p-4 backdrop-blur-md"
              >
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.98 }}
                  className="w-full max-w-sm nq-card-dark rounded-[30px] p-8 text-center"
                >
                  <div className="text-4xl">🚪</div>
                  <h2 className="nq-on-dark mt-4 text-2xl font-bold">Leave this lobby?</h2>
                  <p className="mt-2 text-sm nq-on-dark-soft">You&apos;ll be removed before the host starts the game.</p>
                  <div className="mt-8 flex gap-3">
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="flex-1 rounded-[22px] border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20"
                    >
                      Stay
                    </button>
                    <button
                      onClick={handleLeave}
                      className="flex-1 rounded-[22px] bg-linear-to-r from-[#D84D63] to-[#BA2F54] px-4 py-3 text-sm font-bold text-white transition-colors hover:brightness-110 shadow-lg shadow-rose-900/20"
                    >
                      Leave
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="nq-details nq-on-dark opacity-80">Waiting Lobby</p>
            <h1 className="nq-on-dark mt-2 text-4xl font-bold tracking-tight">{session?.name || 'Loading…'}</h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="nq-card-dark rounded-[40px] p-8 md:p-10"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <p className="nq-on-dark-soft text-sm">
                  <span className="font-bold nq-on-dark text-lg">{playerEntries.length}</span> players joined
                </p>
                <p className="nq-on-dark-soft text-xs mt-0.5 opacity-70">The host will start the quiz when ready.</p>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-[18px] border border-white/15 bg-white/10 px-6 py-2.5 text-sm font-bold nq-on-dark transition-colors hover:bg-white/20"
              >
                Leave
              </button>
            </div>

            <div className="rounded-[32px] bg-white/5 border border-white/10 p-6 md:p-8">
              {playerEntries.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-4xl mb-4">👥</div>
                  <p className="text-xl font-bold nq-on-dark">Waiting for players…</p>
                  <p className="mt-2 text-sm nq-on-dark-soft opacity-60">Share the invite link to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
                  {playerEntries.map(([uid, player]) => (
                    <PlayerChip
                      key={uid}
                      displayName={uid === user.uid ? 'You' : player.displayName}
                      photoURL={player.photoURL}
                      highlighted={uid === user.uid}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-center gap-4 rounded-[24px] bg-white/10 border border-white/20 px-6 py-5 shadow-xl shadow-blue-900/20">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-3 w-3 animate-bounce rounded-full bg-white"
                    style={{ animationDelay: `${index * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="font-bold nq-on-dark text-base">Waiting for the host to start…</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
