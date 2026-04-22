'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import type { QuestionSession } from '@/lib/types';

export default function AdminQuestionsPage() {
  const { t } = useTranslation();
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !isAdmin) router.push('/'); }, [authLoading, isAdmin, router]);

  useEffect(() => {
    fetch('/api/questions/sessions?all=true').then(r => r.ok ? r.json() : []).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    await fetch(`/api/questions/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  if (authLoading || !isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">{t('admin.manage_sessions')}</h1>
        <Link href="/admin/questions/create">
          <Button icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>}>
            {t('admin.create_session')}
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="rounded-2xl border border-white/5 bg-white/5 p-5 animate-pulse h-20"/>)}</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
          <p className="text-gray-400">No question sessions yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <Link href={`/admin/questions/${s.id}/edit`}
                className="rounded-2xl border border-white/5 bg-white/5 p-5 flex items-center justify-between hover:bg-white/[0.08] hover:border-indigo-500/30 transition-colors cursor-pointer group block">
                <div>
                  <h3 className="text-white font-semibold group-hover:text-indigo-400 transition-colors">{s.name}</h3>
                  <p className="text-sm text-gray-400">{s.question_count || 0} questions · {s.timer_seconds}s timer · {s.is_published ? '✅ Published' : '📝 Draft'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">👥 {s.play_count || 0} plays · avg score {s.avg_score || 0} pts</p>
                </div>
                <div className="flex gap-2" onClick={e => e.preventDefault()}>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/questions/${s.id}/lobby`)}>Lobby</Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/questions/${s.id}/edit`)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300">Delete</Button>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
