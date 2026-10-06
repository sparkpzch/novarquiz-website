'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import type { Quiz } from '@/lib/types';

export default function PlayLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<'loading' | 'starting' | 'error'>('loading');

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSession)
      .finally(() => setStatus('starting'));
  }, [sessionId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/sign-in');
      return;
    }

    if (status !== 'starting') return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/play/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            user_id: user.uid,
            is_guest: user.isAnonymous,
          }),
        });
        if (!response.ok) throw new Error('Could not start quiz');
        const started = await response.json();
        if (!cancelled) router.push(`/play/${started.id}/question`);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, router, sessionId, status, user]);

  if (authLoading) return null;

  return (
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="nq-card w-full max-w-lg rounded-[34px] p-7 text-center md:p-9"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-4xl text-white shadow-[0_22px_48px_rgba(17,87,145,0.24)]">
            🚀
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Solo Mode</p>
          <h1 className="mt-2 text-3xl font-bold text-[#16324F]">{session?.name || 'Preparing your quiz'}</h1>
          <p className="mt-3 text-sm text-[#5D7EA1]">
            {status === 'error'
              ? 'We could not start this solo run right now.'
              : `${t('play.questions_count')}: ${session?.question_count || '?'}. Launching the first question now.`}
          </p>

          {status === 'error' ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push('/')}
                className="flex-1 rounded-2xl border border-[#0460A9]/12 bg-white px-4 py-3 text-sm font-semibold text-[#16324F]"
              >
                Back to dashboard
              </button>
              <button
                onClick={() => setStatus('starting')}
                className="flex-1 rounded-2xl bg-[#0460A9] px-4 py-3 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
              <p className="text-sm font-medium text-[#0460A9]">Starting your solo session…</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
