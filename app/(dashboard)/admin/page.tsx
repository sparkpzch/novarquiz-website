'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  questionsCreated: number;
  avgScore: number;
  monthlyActivity: number[];
  scoreDistribution: { correct: number; incorrect: number };
  recentActivity: Array<{
    user_display_name: string;
    session_name: string;
    total_score: number;
    correct_count: number;
    completed_at: string | null;
  }>;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !isAdmin) router.push('/');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/stats')
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [isAdmin]);

  if (loading || !isAdmin) return null;

  const statCards = [
    { label: t('admin.total_users'), value: stats?.totalUsers ?? '—', icon: '👥', color: 'from-indigo-500 to-purple-500' },
    { label: t('admin.active_sessions'), value: stats?.activeSessions ?? '—', icon: '🎯', color: 'from-emerald-500 to-teal-500' },
    { label: t('admin.questions_created'), value: stats?.questionsCreated ?? '—', icon: '❓', color: 'from-amber-500 to-orange-500' },
    { label: t('admin.avg_scores'), value: stats ? `${stats.avgScore}pts` : '—', icon: '📈', color: 'from-rose-500 to-pink-500' },
  ];

  const maxActivity = stats ? Math.max(...stats.monthlyActivity, 1) : 1;
  const correctPct = stats?.scoreDistribution.correct ?? 0;
  const incorrectPct = stats?.scoreDistribution.incorrect ?? 0;
  // SVG donut: circumference of r=80 circle = 502.65
  const C = 502.65;
  const correctDash = (correctPct / 100) * C;
  const incorrectDash = (incorrectPct / 100) * C;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">{t('admin.title')}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="rounded-2xl border border-white/5 bg-white/5 p-5 hover:bg-white/[0.08] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">{s.icon}</span>
              {fetching && <div className="w-12 h-4 bg-white/10 rounded animate-pulse" />}
            </div>
            <p className="text-3xl font-bold text-white mb-1">
              {fetching ? <span className="inline-block w-16 h-8 bg-white/10 rounded animate-pulse" /> : s.value}
            </p>
            <p className="text-sm text-gray-400">{s.label}</p>
            <div className={`mt-3 h-1 rounded-full bg-gradient-to-r ${s.color} opacity-60`} />
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly activity bar chart */}
        <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Play Sessions (12 months)</h3>
          <div className="h-48 flex items-end gap-1.5">
            {(stats?.monthlyActivity ?? new Array(12).fill(0)).map((count, i) => {
              const pct = maxActivity > 0 ? Math.max((count / maxActivity) * 100, count > 0 ? 4 : 0) : 0;
              return (
                <motion.div key={i}
                  initial={{ height: 0 }} animate={{ height: `${pct}%` }}
                  transition={{ delay: i * 0.05, type: 'spring' }}
                  title={`${MONTHS[i]}: ${count} sessions`}
                  className="flex-1 rounded-t-lg bg-gradient-to-t from-indigo-600 to-purple-500 opacity-80 hover:opacity-100 transition-opacity cursor-default"
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            {MONTHS.map(m => <span key={m}>{m}</span>)}
          </div>
        </div>

        {/* Score distribution donut */}
        <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Answer Distribution</h3>
          <div className="flex items-center justify-center h-48">
            {fetching ? (
              <div className="w-40 h-40 rounded-full border-[20px] border-white/10 animate-pulse" />
            ) : (
              <svg viewBox="0 0 200 200" className="w-40 h-40">
                <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="20" />
                {correctDash > 0 && (
                  <circle cx="100" cy="100" r="80" fill="none" stroke="url(#grad1)" strokeWidth="20"
                    strokeDasharray={`${correctDash} ${C}`} strokeLinecap="round"
                    transform="rotate(-90 100 100)" />
                )}
                {incorrectDash > 0 && (
                  <circle cx="100" cy="100" r="80" fill="none" stroke="url(#grad2)" strokeWidth="20"
                    strokeDasharray={`${incorrectDash} ${C}`} strokeDashoffset={-correctDash}
                    strokeLinecap="round" transform="rotate(-90 100 100)" />
                )}
                <defs>
                  <linearGradient id="grad1"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#a855f7"/></linearGradient>
                  <linearGradient id="grad2"><stop stopColor="#10b981"/><stop offset="1" stopColor="#06b6d4"/></linearGradient>
                </defs>
                <text x="100" y="96" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">{correctPct}%</text>
                <text x="100" y="114" textAnchor="middle" fill="#9ca3af" fontSize="11">correct</text>
              </svg>
            )}
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-sm text-gray-400">Correct ({correctPct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-400">Incorrect ({incorrectPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{t('admin.recent_activity')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-3 px-4 font-medium">User</th>
                <th className="text-left py-3 px-4 font-medium">Session</th>
                <th className="text-left py-3 px-4 font-medium">Score</th>
                <th className="text-left py-3 px-4 font-medium">Correct</th>
                <th className="text-left py-3 px-4 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                [1,2,3].map(i => (
                  <tr key={i} className="border-b border-white/5">
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !stats?.recentActivity.length ? (
                <tr className="border-b border-white/5 text-gray-400">
                  <td className="py-3 px-4" colSpan={5}>No activity yet</td>
                </tr>
              ) : (
                stats.recentActivity.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 text-gray-300 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">{row.user_display_name}</td>
                    <td className="py-3 px-4 text-gray-400">{row.session_name}</td>
                    <td className="py-3 px-4 font-medium text-indigo-400">{row.total_score}</td>
                    <td className="py-3 px-4 text-emerald-400">{row.correct_count}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {row.completed_at ? new Date(row.completed_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
