'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/questions/sessions/${sessionId}`).then(r => r.ok ? r.json() : null).then(setSession).finally(() => setLoading(false));
  }, [sessionId]);

  if (authLoading) return null;
  if (!user) { router.push('/sign-in'); return null; }

  const handleStart = async () => {
    // Initialize play session (guests skip analytics persistence)
    await fetch(`/api/play/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', user_id: user.uid, is_guest: user.isAnonymous }),
    });
    router.push(`/play/${sessionId}/question`);
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>;

  if (!session) return <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center text-white">Session not found</div>;

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-2xl shadow-indigo-500/30">
          <span className="text-3xl">🧠</span>
        </div>
        <h1 className="text-3xl font-bold text-white">{session.name}</h1>
        {session.description && <p className="text-gray-400">{session.description}</p>}
        <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
          <span>📝 {session.question_count || '?'} {t('play.questions_count')}</span>
          <span>⏱ Count-up timer from 0</span>
        </div>
        <h2 className="text-xl text-white">{t('play.ready')}</h2>
        <Button onClick={handleStart} size="lg" className="w-full text-lg">{t('play.start')} 🚀</Button>
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm transition-colors">← Back to Dashboard</button>
      </motion.div>
    </div>
  );
}
