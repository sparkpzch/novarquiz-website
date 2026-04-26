'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInAnonymously, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/lib/hooks/useAuth';
import { joinWaitingRoom, claimLeaderIfEmpty, resolveJoinToken, trackUserSession, getRoom } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import { ROOM_STATUS } from '@/lib/constants/session';
import { motion } from 'motion/react';

type SessionInfo = {
  id: string;
  name: string;
  description: string | null;
  is_private?: boolean;
};

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [guestName, setGuestName] = useState('');

  // Sign in anonymously if there's no existing session.
  // This lets anyone join via a shareable link without creating an account.
  useEffect(() => {
    if (!authLoading && !user) {
      signInAnonymously(auth).catch(() => {
        setFetchError('Could not start a guest session. Please try again.');
      });
    }
  }, [authLoading, user]);

  // Resolve join token → sessionId via RTDB or DB, then fetch session info.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        // 1. Try Firebase RTDB resolution
        const sessionIdFromRtdb = await resolveJoinToken(token);
        if (cancelled) return;

        if (sessionIdFromRtdb) {
          const res = await fetch(`/api/sessions/${sessionIdFromRtdb}`);
          if (!res.ok) {
            setFetchError('Session not found');
            return;
          }
          const data = await res.json();

          // 1.5 Check if the session is joinable in RTDB
          const room = await getRoom(sessionIdFromRtdb);
          if (!room || room.status === ROOM_STATUS.ENDED) {
            setFetchError('This invite link is no longer valid. Ask the host for a new one.');
            return;
          }

          if (!cancelled) setSession({ 
            id: data.id, 
            name: data.quiz_name || data.name, 
            description: data.quiz_description || data.description,
            is_private: data.is_private 
          });
          return;
        }

        // 2. Fallback: Try PostgreSQL resolution (for pin_code or share_token)
        const res = await fetch(`/api/join/${token}`);
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          
          // Check if the session is joinable in RTDB
          const room = await getRoom(data.id);
          if (!room || room.status === ROOM_STATUS.ENDED) {
            setFetchError('This invite link is no longer valid. Ask the host for a new one.');
            return;
          }

          if (!cancelled) setSession({ 
            id: data.id, 
            name: data.name, 
            description: data.description,
            is_private: data.is_private
          });
        } else {
          setFetchError('This invite link is no longer valid. Ask the host for a new one.');
        }
      } catch {
        if (!cancelled) setFetchError('Failed to load session');
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  const handleJoin = async () => {
    if (!session || !user) return;
    setJoining(true);
    setJoinError('');

    trackEvent('session_join_attempted', { session_id: session.id });

    try {
      if (user.isAnonymous && guestName.trim()) {
        await updateProfile(user, { displayName: guestName.trim() });
      }

      // 1. Call RESTful Join API
      const res = await fetch(`/api/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: user.displayName || guestName.trim() || 'Anonymous',
          photoURL: user.photoURL,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to join session');
      }

      const joinData = await res.json();

      // 2. Claim leader if empty (this remains client-side as a fast transaction)
      await claimLeaderIfEmpty(session.id, user.uid);
      
      trackEvent('session_join_succeeded', { session_id: session.id });
      
      // Once the room has started, late joiners go directly into gameplay.
      if (joinData.roomStatus === ROOM_STATUS.STARTED) {
        router.push(`/play/${session.id}/question`);
      } else {
        router.push(`/play/${session.id}/lobby`);
      }
    } catch (err) {
      console.error('Join failed:', err);
      setJoinError(`Could not join: ${(err as Error).message || 'unknown error'}`);
      setJoining(false);
    }
  };

  // Show spinner while Firebase resolves auth state (including anonymous sign-in).
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-angular-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-angular-300/15 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {fetchError ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-xl font-bold text-white mb-2">Session Unavailable</h1>
            <p className="text-gray-400 text-sm">{fetchError}</p>
          </div>
        ) : !session ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-angular-700 to-angular-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎮</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">{session.name}</h1>
              {session.description && (
                <p className="text-gray-400 text-sm">{session.description}</p>
              )}
            </div>

            {user.isAnonymous && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-300 block mb-2">
                  Your name (optional)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="Guest"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-angular-700 focus:outline-none placeholder:text-gray-600"
                />
              </div>
            )}

            {joinError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm mb-4 text-center">
                {joinError}
              </motion.p>
            )}

            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-3 rounded-xl bg-linear-to-r from-angular-700 to-angular-500 text-white! font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:from-angular-500 hover:to-angular-700 transition-all"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Joining…
                </span>
              ) : (
                'Join Session'
              )}
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              {user.isAnonymous
                ? 'Playing as guest — progress won\'t be saved'
                : <>Joining as <span className="text-angular-300">{user.displayName || user.email}</span></>}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
