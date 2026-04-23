'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

function PlayerAvatar({ displayName, photoURL, size = 14 }: { displayName: string; photoURL: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const px = size * 4;
  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        style={{ width: px, height: px }}
        className="rounded-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, fontSize: px * 0.38 }}
      className="rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0"
    >
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function TeamLobbyPage({
  params,
}: {
  params: Promise<{ sessionId: string; roomId: string }>;
}) {
  const { sessionId, roomId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [room, setRoom] = useState<TeamRoom | null>(null);
  const [sessionName, setSessionName] = useState('');

  // Join flow state (for non-host visitors)
  const [phase, setPhase] = useState<'loading' | 'join' | 'lobby'>('loading');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  // PIN read from `?pin=…` on mount. Stored in a ref because the auto-join
  // effect needs to know "did the URL pre-fill this?" without waiting for
  // a re-render cycle to re-derive it from the input value.
  const prefilledPinRef = useRef('');
  const autoJoinTriedRef = useRef(false);

  // Pre-fill PIN from share link query (?pin=123456) once after mount.
  // Done in an effect (not useState initializer) so SSR-empty hydration
  // doesn't lock in '' before the URL is available.
  useEffect(() => {
    const urlPin = (new URLSearchParams(window.location.search).get('pin') ?? '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (urlPin) {
      prefilledPinRef.current = urlPin;
      setPin(urlPin);
    }
  }, []);

  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setSessionName(s.name); });
  }, [sessionId]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?next=/play/${sessionId}/team/${roomId}`);
    }
  }, [authLoading, user, router, sessionId, roomId]);

  // Watch the team room
  useEffect(() => {
    const unsub = watchTeamRoom(roomId, (data) => {
      setRoom(data);
      if (data?.status === 'started') {
        router.push(`/play/${sessionId}/question`);
        return;
      }
      if (data && user) {
        // Determine phase: host → directly to lobby; existing player → lobby; stranger → join
        const inRoom = !!data.players?.[user.uid];
        setPhase(inRoom ? 'lobby' : 'join');
      } else if (data === null) {
        // Room doesn't exist
        router.push('/');
      }
    });
    return unsub;
  }, [roomId, sessionId, user, router]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  useEffect(() => {
    return () => {
      if (user && phase === 'lobby') leaveTeamRoom(roomId, user.uid);
    };
  }, [roomId, user, phase]);

  const handleJoin = useCallback(async () => {
    if (!user || !room) return;
    setJoining(true);
    setPinError('');
    try {
      const ok = await joinTeamRoom(roomId, pin, user);
      if (ok) {
        await trackUserSession(user.uid, {
          sessionId,
          sessionName: sessionName || 'Team room',
          mode: 'team',
          roomId,
          joinedAt: Date.now(),
        });
        setPhase('lobby');
      } else {
        setPinError('Incorrect PIN. Try again.');
        setJoining(false);
      }
    } catch (err) {
      console.error('joinTeamRoom failed:', err);
      setPinError(`Could not join: ${(err as Error).message || 'unknown error'}`);
      setJoining(false);
    }
  }, [user, room, roomId, pin]);

  // Auto-join once if a valid PIN was supplied via share link (?pin=…) and we
  // landed on the join screen. Single-shot so a wrong PIN doesn't loop.
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
  }, [phase, pin, room, user, joining, handleJoin]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startTeamRoom(roomId);
      // Navigate ourselves — don't rely solely on the RTDB watcher firing.
      router.push(`/play/${sessionId}/question`);
    } catch (err) {
      console.error('startTeamRoom failed:', err);
      setStarting(false);
    }
  };

  const handleLeave = useCallback(async () => {
    if (user) {
      await leaveTeamRoom(roomId, user.uid);
      await untrackUserSession(user.uid, sessionId, roomId);
    }
    router.push('/');
  }, [roomId, sessionId, user, router]);

  // Share URL embeds the PIN so invitees skip the PIN-entry screen.
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const players = Object.entries(room?.players ?? {});
  const isHost = user.uid === room?.hostId;

  // ── PIN entry view ─────────────────────────────────────────────────────────
  if (phase === 'join') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-sm"
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 text-3xl">
                👥
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">{sessionName || '…'}</h1>
              <p className="text-gray-400 text-sm">Team room · enter PIN to join</p>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-gray-300 block mb-2">🔐 Enter PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                onKeyDown={e => e.key === 'Enter' && pin.length === 6 && handleJoin()}
                placeholder="000000"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] focus:border-purple-500 focus:outline-none placeholder:text-gray-600"
              />
              {pinError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm mt-2 text-center">
                  {pinError}
                </motion.p>
              )}
            </div>

            <button
              onClick={handleJoin}
              disabled={joining || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-indigo-500 transition-all"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Joining…
                </span>
              ) : 'Join Team Room'}
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              Joining as <span className="text-gray-300">{user.displayName || user.email}</span>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Lobby view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Leave confirmation */}
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
              <h2 className="text-lg font-bold text-white mb-1">Leave the team room?</h2>
              <p className="text-gray-400 text-sm mb-6">You'll be removed from this team lobby.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors">Stay</button>
                <button onClick={handleLeave} className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-medium mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                Team room · {players.length} player{players.length !== 1 ? 's' : ''}
              </div>
              <h1 className="text-3xl font-bold text-white">{sessionName || '…'}</h1>
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="mt-1 px-3 py-1.5 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:border-white/20 transition-colors"
            >
              Leave
            </button>
          </div>
        </motion.div>

        {/* PIN + share link (host only) */}
        {isHost && room && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-3 mb-4"
          >
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Team PIN</p>
              <p className="text-3xl font-mono font-bold text-white tracking-[0.2em]">{room.pin}</p>
              <p className="text-xs text-gray-500 mt-1">Share this with your team</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Join Link</p>
              <p className="text-xs text-gray-400 font-mono truncate mb-2">{shareUrl}</p>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 text-xs font-medium hover:bg-purple-600/30 transition-colors"
              >
                {copied ? '✓ Copied!' : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Link</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Player grid */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 mb-4 min-h-[160px]"
        >
          {players.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-gray-500">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-sm">Share the PIN or link to invite players</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
              <AnimatePresence>
                {players.map(([uid, player], i) => {
                  const isMe = uid === user.uid;
                  const isRoomHost = uid === room?.hostId;
                  return (
                    <motion.div
                      key={uid}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div className={`relative rounded-full ${isMe ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-transparent' : ''}`}>
                        <PlayerAvatar displayName={player.displayName} photoURL={player.photoURL} size={14} />
                        {isRoomHost && <span className="absolute -top-1 -right-1 text-sm" title="Host">👑</span>}
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

        {/* Start button (host only) */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={starting || players.length === 0}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg shadow-purple-500/20"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting…
              </span>
            ) : `🚀 Start Game (${players.length} player${players.length !== 1 ? 's' : ''})`}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3 text-gray-500 text-sm">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span>Waiting for the host to start…</span>
          </div>
        )}
      </div>
    </div>
  );
}
