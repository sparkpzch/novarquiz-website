'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { joinWaitingRoom } from '@/lib/firebase/rtdb';
import { motion } from 'motion/react';

type SessionInfo = {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
};

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setFetchError(data.error);
        else setSession(data);
      })
      .catch(() => setFetchError('Failed to load session'));
  }, [token]);

  // Redirect unauthenticated users to sign-in, returning here after
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?next=/join/${token}`);
    }
  }, [authLoading, user, router, token]);

  const handleJoin = async () => {
    if (!session || !user) return;
    setJoining(true);
    setPinError('');

    if (session.is_private) {
      const res = await fetch(`/api/join/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPinError(data.error || 'Incorrect PIN');
        setJoining(false);
        return;
      }
    }

    await joinWaitingRoom(session.id, user);
    router.push(`/play/${session.id}/lobby`);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
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
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎮</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">{session.name}</h1>
              {session.description && (
                <p className="text-gray-400 text-sm">{session.description}</p>
              )}
            </div>

            {session.is_private && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-300 block mb-2">
                  🔐 Enter PIN to join
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="000000"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] focus:border-indigo-500 focus:outline-none placeholder:text-gray-600"
                />
                {pinError && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-400 text-sm mt-2 text-center"
                  >
                    {pinError}
                  </motion.p>
                )}
              </div>
            )}

            <button
              onClick={handleJoin}
              disabled={joining || (session.is_private && pin.length !== 6)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-500 hover:to-purple-500 transition-all"
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
              Joining as <span className="text-gray-300">{user.displayName || user.email}</span>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
