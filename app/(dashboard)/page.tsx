'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import Link from 'next/link';
import { motion } from 'motion/react';
import type { QuestionSession } from '@/lib/types';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/questions/sessions').then(r => r.ok ? r.json() : []).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">{t('dashboard.welcome')}, {user?.displayName || 'Player'}! 👋</h1>
        <p className="text-gray-400 mt-1">Ready to test your knowledge?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t('dashboard.total_played'), value: '—', icon: '🎮', color: 'from-indigo-600 to-purple-600' },
          { label: t('dashboard.avg_score'), value: '—', icon: '📊', color: 'from-emerald-600 to-cyan-600' },
          { label: t('dashboard.best_streak'), value: '—', icon: '🔥', color: 'from-orange-600 to-red-600' },
        ].map((stat, idx) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
            className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <div className={`w-10 h-1 rounded-full bg-gradient-to-r ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-white mb-4">{t('dashboard.available_quizzes')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-white/5 bg-white/5 p-5 animate-pulse"><div className="h-4 bg-white/10 rounded mb-3 w-3/4"/><div className="h-3 bg-white/5 rounded w-full"/></div>)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
            <p className="text-gray-400 text-lg">🎯 {t('dashboard.no_quizzes')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s, idx) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Link href={`/play/${s.id}`}>
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-5 hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 cursor-pointer group">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">{s.name}</h3>
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-medium">{s.question_count} Q</span>
                    </div>
                    {s.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{s.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>⏱ {s.timer_seconds}s</span><span>•</span><span>{t('dashboard.join_quiz')} →</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
