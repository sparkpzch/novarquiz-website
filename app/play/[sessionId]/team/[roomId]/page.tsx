'use client';

import { Suspense, use, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  watchTeamRoom,
  joinTeamRoom,
  leaveTeamRoom,
  startTeamRoom,
  trackUserSession,
  untrackUserSession,
  type TeamRoom,
} from '@/lib/firebase/rtdb';
import { motion, AnimatePresence } from 'motion/react';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

function PartyMember({
  displayName,
  photoURL,
  isMe,
  isHost,
}: {
  displayName: string;
  photoURL: string | null;
  isMe: boolean;
  isHost: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2"
    >
      <div className={`relative rounded-full ${isMe ? 'ring-4 ring-[#92BFFF]' : ''}`}>
        <ProfileAvatar displayName={displayName} photoURL={photoURL} size={66} />
        {isHost && <span className="absolute -right-1 -top-2 text-lg">👑</span>}
      </div>
      <p className="max-w-[90px] truncate text-center text-sm font-semibold text-[#16324F]">{isMe ? 'You' : displayName}</p>
    </motion.div>
  );
}

function TeamLobbyPageContent({
  params,
}: {
  params: Promise<{ sessionId: string; roomId: string }>;
}) {
  const { sessionId, roomId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPin = (searchParams.get('pin') ?? '').replace(/\D/g, '').slice(0, 6);
  const inviteNextPath = initialPin
    ? `/play/${sessionId}/team/${roomId}?pin=${initialPin}`
    : `/play/${sessionId}/team/${roomId}`;

  const [room, setRoom] = useState<TeamRoom | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [phase, setPhase] = useState<'loading' | 'join' | 'lobby'>('loading');
  const [pin, setPin] = useState(initialPin);
  const [pinError, setPinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const prefilledPinRef = useRef(initialPin);
  const autoJoinTriedRef = useRef(false);
  const joinedUserIdRef = useRef<string | null>(null);
  const shouldLeaveOnUnmountRef = useRef(true);

  useEffect(() => {
    fetch(`/api/quizzes/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setSessionName(data.name); });
  }, [sessionId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(inviteNextPath)}`);
    }
  }, [authLoading, inviteNextPath, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const acceptRoom = (data: TeamRoom | null) => {
      if (cancelled) return;
      setRoom(previous => data ? {...data,pin:previous?.pin ?? data.pin} : null);
      if (!data || data.sessionId !== sessionId) { router.replace('/'); return; }
      const inRoom = data.hostId === user.uid || !!data.players?.[user.uid];
      if (inRoom && data.status === 'started') {
        shouldLeaveOnUnmountRef.current = false;
        router.replace(`/play/${sessionId}/question`); return;
      }
      setPhase(inRoom ? 'lobby' : 'join');
    };
    // Non-members use the server summary; only admitted members may subscribe
    // to private live room data. The host's PIN arrives through this API only.
    fetch(`/api/team-rooms/${roomId}`).then(async response => {
      if (!response.ok) throw new Error('Room unavailable');
      const data = await response.json();
      if (cancelled) return;
      acceptRoom(data);
      if (data.hostId === user.uid || data.players?.[user.uid]) unsubscribe = watchTeamRoom(roomId, acceptRoom);
    }).catch(() => { if (!cancelled) router.replace('/'); });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [roomId, router, sessionId, user, joining]);

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
      if (shouldLeaveOnUnmountRef.current && uid && phase === 'lobby') {
        leaveTeamRoom(roomId, uid);
      }
    };
  }, [phase, roomId]);

  const handleJoin = useCallback(async () => {
    if (!user || !room) return;
    setJoining(true);
    setPinError('');
    try {
      const joined = await joinTeamRoom(roomId, pin, user);
      if (!joined) {
        setPinError('Incorrect PIN. Try again.');
        setJoining(false);
        return;
      }
      await trackUserSession(user.uid, {
        sessionId,
        sessionName: sessionName || 'Party room',
        mode: 'team',
        roomId,
        joinedAt: Date.now(),
      });
      setPhase('lobby');
      setJoining(false);
    } catch (error) {
      console.error('joinTeamRoom failed:', error);
      setPinError(`Could not join: ${(error as Error).message || 'unknown error'}`);
      setJoining(false);
    }
  }, [pin, room, roomId, sessionId, sessionName, user]);

  useEffect(() => {
    if (
      phase === 'join' &&
      !autoJoinTriedRef.current &&
      prefilledPinRef.current.length === 6 &&
      pin === prefilledPinRef.current &&
      room &&
      user &&
      !joining
    ) {
      autoJoinTriedRef.current = true;
      handleJoin();
    }
  }, [handleJoin, joining, phase, pin, room, user]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startTeamRoom(roomId);
      router.push(`/play/${sessionId}/question`);
    } catch (error) {
      console.error('startTeamRoom failed:', error);
      setStarting(false);
    }
  };

  const handleLeave = useCallback(async () => {
    shouldLeaveOnUnmountRef.current = false;
    if (user) {
      await leaveTeamRoom(roomId, user.uid);
      await untrackUserSession(user.uid, sessionId, roomId);
    }
    router.push('/');
  }, [roomId, router, sessionId, user]);

  const shareUrl = typeof window !== 'undefined' && room?.pin
    ? `${window.location.origin}/play/${sessionId}/team/${roomId}?pin=${room.pin}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || !user || phase === 'loading') {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
        </div>
      </div>
    );
  }

  const players = Object.entries(room?.players ?? {});
  const isHost = user.uid === room?.hostId;

  if (phase === 'join') {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="nq-card w-full max-w-md rounded-[34px] p-7 text-center"
          >
            <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-[26px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-4xl text-white shadow-[0_20px_40px_rgba(17,87,145,0.22)]">
              🎉
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Party Mode</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F]">{sessionName || 'Join the room'}</h1>
            <p className="mt-2 text-sm text-[#5D7EA1]">Enter the six-digit PIN from the host to join this party lobby.</p>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-semibold text-[#16324F]">Party PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, ''));
                  setPinError('');
                }}
                onKeyDown={(event) => event.key === 'Enter' && pin.length === 6 && handleJoin()}
                placeholder="000000"
                className="w-full rounded-[24px] border border-[#0460A9]/12 bg-white px-4 py-4 text-center text-3xl font-bold tracking-[0.45em] text-[#16324F] outline-none placeholder:text-[#A5B7CA] focus:border-[#0460A9]"
              />
              {pinError && <p className="mt-3 text-sm font-medium text-[#D63A3D]">{pinError}</p>}
            </div>

            <button
              onClick={handleJoin}
              disabled={joining || pin.length !== 6}
              className="mt-6 w-full rounded-[24px] bg-linear-to-r from-[#0A6FD6] to-[#0460A9] px-4 py-4 text-sm font-semibold text-[#F8FBFF] shadow-[0_18px_40px_rgba(17,87,145,0.22)] disabled:opacity-60"
            >
              {joining ? 'Joining…' : 'Join party'}
            </button>

            <p className="mt-4 text-xs text-[#5D7EA1]">Joining as {user.displayName || user.email}</p>
          </motion.div>
        </div>
      </div>
    );
  }

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
                  className="w-full max-w-sm rounded-[30px] border border-[#92BFFF]/45 bg-linear-to-b from-[#F9FCFF] via-[#EEF6FF] to-[#E3F0FF] p-6 text-center shadow-[0_30px_70px_rgba(17,87,145,0.22)]"
                >
                  <div className="text-4xl">🚪</div>
                  <h2 className="mt-3 text-xl font-bold text-[#16324F]">Leave this party?</h2>
                  <p className="mt-2 text-sm text-[#456786]">You&apos;ll be removed from the lobby and won&apos;t join when the game starts.</p>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="flex-1 rounded-2xl border border-[#92BFFF]/45 bg-white px-4 py-3 text-sm font-semibold text-[#16324F] shadow-[0_10px_24px_rgba(17,87,145,0.08)] transition hover:bg-[#F4F9FF]"
                    >
                      Stay
                    </button>
                    <button
                      onClick={handleLeave}
                      className="flex-1 rounded-2xl bg-linear-to-r from-[#D84D63] to-[#BA2F54] px-4 py-3 text-sm font-semibold text-[#FFF8FA] shadow-[0_14px_30px_rgba(186,47,84,0.28)] transition hover:brightness-105"
                    >
                      Leave
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="nq-card rounded-[34px] p-6 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Party Lobby</p>
                <h1 className="mt-2 text-3xl font-bold text-[#16324F]">{sessionName || 'Loading…'}</h1>
                <p className="mt-2 text-sm text-[#5D7EA1]">{players.length} player{players.length !== 1 ? 's' : ''} in the room. Share the PIN or invite URL, then start together.</p>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-2xl border border-[#92BFFF]/40 bg-[#F7FBFF] px-4 py-3 text-sm font-semibold text-[#16324F] shadow-[0_10px_24px_rgba(17,87,145,0.08)] transition hover:bg-white"
              >
                Leave
              </button>
            </div>

            {isHost && room && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="nq-card-blue rounded-[28px] p-5">
                  <p className="nq-on-dark-soft text-xs font-semibold uppercase tracking-[0.26em]">Party PIN</p>
                  <p className="nq-on-dark mt-3 text-4xl font-bold tracking-[0.28em]">{room.pin}</p>
                  <p className="nq-on-dark-muted mt-2 text-sm">Share this code with players nearby.</p>
                </div>

                <div className="rounded-[28px] border border-[#92BFFF]/30 bg-linear-to-b from-white/92 to-[#EAF4FF]/96 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#456786]">Invite Link</p>
                  <p className="mt-3 break-all text-sm text-[#16324F]">{shareUrl}</p>
                  <button
                    onClick={copyLink}
                    className="mt-4 rounded-2xl bg-linear-to-r from-[#0A6FD6] to-[#0460A9] px-4 py-3 text-sm font-semibold text-[#F8FBFF] shadow-[0_14px_30px_rgba(17,87,145,0.22)] transition hover:brightness-105"
                  >
                    {copied ? 'Copied!' : 'Copy invite URL'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-[28px] border border-[#92BFFF]/30 bg-linear-to-b from-white/82 to-[#EAF4FF]/94 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              {players.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <div className="text-4xl">👥</div>
                  <p className="mt-3 text-base font-semibold text-[#16324F]">Share the PIN or link to invite your party.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
                  {players.map(([uid, player]) => (
                    <PartyMember
                      key={uid}
                      displayName={player.displayName}
                      photoURL={player.photoURL}
                      isMe={uid === user.uid}
                      isHost={uid === room?.hostId}
                    />
                  ))}
                </div>
              )}
            </div>

            {isHost ? (
              <button
                onClick={handleStart}
                disabled={starting || players.length === 0}
                className="mt-6 w-full rounded-[24px] bg-linear-to-r from-[#0A6FD6] via-[#0460A9] to-[#03508E] px-4 py-4 text-base font-semibold text-[#F8FBFF] shadow-[0_20px_42px_rgba(17,87,145,0.24)] transition hover:brightness-105 disabled:opacity-60"
              >
                {starting ? 'Starting…' : `Start party quiz (${players.length})`}
              </button>
            ) : (
              <div className="mt-6 flex items-center justify-center gap-3 rounded-[22px] bg-[#0E173A] px-4 py-3 text-sm text-[#F8FBFF] shadow-[0_18px_34px_rgba(7,16,43,0.2)]">
                <div className="flex gap-1">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#92BFFF]"
                      style={{ animationDelay: `${index * 0.12}s` }}
                    />
                  ))}
                </div>
                <span>Waiting for the host to start…</span>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function TeamLobbyPage(props: { params: Promise<{ sessionId: string; roomId: string }> }) {
  return (
    <Suspense fallback={
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
        </div>
      </div>
    }>
      <TeamLobbyPageContent {...props} />
    </Suspense>
  );
}
