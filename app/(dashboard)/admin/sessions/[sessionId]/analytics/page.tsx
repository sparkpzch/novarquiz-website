'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Session, LeaderboardEntry } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

interface QuestionAnalytic {
  id: string;
  question_text: string;
  question_order: number;
  node_type: string;
  total_responses: number;
  avg_time_ms: number;
  choices: {
    label: string;
    text: string;
    is_correct: boolean;
    count: number;
  }[];
}

interface AnalyticsData {
  session: Session & { quiz_name: string; quiz_description: string };
  leaderboard: (LeaderboardEntry & { profile_photo?: string })[];
  questions: QuestionAnalytic[];
}

export default function SessionAnalyticsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'questions'>('leaderboard');

  useEffect(() => {
    fetch(`/api/admin/sessions/${sessionId}/analytics`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0460A9] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="nq-card p-12 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Failed to load analytics</h2>
        <p className="text-gray-400 mb-6">{error || 'Session not found'}</p>
        <button
          onClick={() => router.back()}
          className="rounded-xl bg-white/10 px-6 py-2 text-white hover:bg-white/20 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  const { session, leaderboard, questions } = data;
  const avgScore = leaderboard.length > 0 
    ? Math.round(leaderboard.reduce((acc, curr) => acc + curr.total_score, 0) / leaderboard.length) 
    : 0;
  
  const avgTimeMs = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((acc, curr) => acc + curr.total_time_ms, 0) / leaderboard.length)
    : 0;

  const formatDuration = (ms: number) => {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-sm text-[#5D7EA1] hover:text-white transition group"
          >
            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Quizzes Manager
          </button>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white">{session.name || session.quiz_name}</h1>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              session.status === 'opened' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
              session.status === 'started' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              session.status === 'archived' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
              'bg-gray-500/20 text-gray-400 border-gray-500/30'
            }`}>
              {session.status}
            </span>
          </div>
          <p className="text-[#5D7EA1]">Template: <span className="text-white/60">{session.quiz_name}</span></p>
        </div>

        <div className="flex items-center gap-2">
           <div className="text-right hidden md:block">
              <p className="text-[10px] text-[#5D7EA1] uppercase tracking-widest font-bold">Session ID</p>
              <p className="text-xs text-white/40 font-mono">{sessionId}</p>
           </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Players', value: leaderboard.length, icon: '👥', color: 'blue' },
          { label: 'Avg. Score', value: avgScore, icon: '🏆', color: 'amber' },
          { label: 'Avg. Time', value: formatDuration(avgTimeMs), icon: '⏱️', color: 'emerald' },
          { label: 'Questions', value: questions.length, icon: '❓', color: 'indigo' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="nq-card p-6 relative overflow-hidden"
          >
            <div className="text-2xl mb-2">{stat.icon}</div>
            <p className="text-xs font-semibold text-[#5D7EA1] uppercase tracking-widest">{stat.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'leaderboard' ? 'bg-[#0460A9] text-white shadow-lg' : 'text-[#5D7EA1] hover:text-white'
          }`}
        >
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab('questions')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'questions' ? 'bg-[#0460A9] text-white shadow-lg' : 'text-[#5D7EA1] hover:text-white'
          }`}
        >
          Question Breakdown
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'leaderboard' ? (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="nq-card overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-[#5D7EA1] uppercase tracking-[0.2em] font-bold">
                    <th className="py-4 px-6">Rank</th>
                    <th className="py-4 px-6">Player</th>
                    <th className="py-4 px-6 text-center">Score</th>
                    <th className="py-4 px-6 text-center">Correct</th>
                    <th className="py-4 px-6 text-center">Incorrect</th>
                    <th className="py-4 px-6 text-center">Time</th>
                    <th className="py-4 px-6 text-right">Finished At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500 italic">No players have finished this session yet.</td>
                    </tr>
                  ) : (
                    leaderboard.map((entry, i) => (
                      <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-4 px-6">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-500/20 text-amber-400' :
                            i === 1 ? 'bg-gray-300/20 text-gray-300' :
                            i === 2 ? 'bg-amber-700/20 text-amber-600' :
                            'bg-white/5 text-gray-500'
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar 
                              displayName={entry.user_display_name} 
                              photoURL={entry.profile_photo} 
                              size={32} 
                            />
                            <span className="font-semibold text-white">{entry.user_display_name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="text-lg font-bold text-[#70A2F9]">{entry.total_score}</span>
                        </td>
                        <td className="py-4 px-6 text-center text-emerald-400 font-medium">{entry.correct_count}</td>
                        <td className="py-4 px-6 text-center text-rose-400 font-medium">{entry.incorrect_count}</td>
                        <td className="py-4 px-6 text-center text-gray-400 text-xs">{formatDuration(entry.total_time_ms)}</td>
                        <td className="py-4 px-6 text-right text-gray-500 text-xs">
                          {new Date(entry.completed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="questions"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {questions.map((q, idx) => (
              <div key={q.id} className="nq-card p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between gap-4 mb-8">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                       <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-[#70A2F9]">
                         {idx + 1}
                       </span>
                       <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                         {q.node_type}
                       </span>
                    </div>
                    <h3 className="text-xl font-semibold text-white leading-relaxed">{q.question_text}</h3>
                  </div>
                  
                  <div className="flex gap-8 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] text-[#5D7EA1] uppercase tracking-widest font-bold mb-1">Responses</p>
                      <p className="text-xl font-bold text-white">{q.total_responses}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#5D7EA1] uppercase tracking-widest font-bold mb-1">Avg Time</p>
                      <p className="text-xl font-bold text-white">{formatDuration(q.avg_time_ms)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {(q.choices || []).map((c) => {
                    const percentage = q.total_responses > 0 ? Math.round((c.count / q.total_responses) * 100) : 0;
                    return (
                      <div key={c.label} className="group">
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-3">
                              <span className={`h-6 w-6 flex items-center justify-center rounded-md text-[10px] font-bold ${
                                c.is_correct ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-400'
                              }`}>
                                {c.label}
                              </span>
                              <span className={`text-sm ${c.is_correct ? 'text-emerald-400 font-medium' : 'text-gray-300'}`}>
                                {c.text}
                              </span>
                           </div>
                           <div className="flex items-center gap-4">
                              <span className="text-xs text-gray-500">{c.count} responses</span>
                              <span className="text-sm font-bold text-white w-8 text-right">{percentage}%</span>
                           </div>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: idx * 0.05 }}
                            className={`h-full rounded-full ${c.is_correct ? 'bg-emerald-500/60' : 'bg-white/20'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
