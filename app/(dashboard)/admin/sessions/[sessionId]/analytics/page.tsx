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
        <h2 className="text-xl font-bold text-[#16324F] mb-2">Failed to load analytics</h2>
        <p className="text-[#5D7EA1] mb-6">{error || 'Session not found'}</p>
        <button
          onClick={() => router.back()}
          className="rounded-[22px] px-6 py-2.5 font-semibold transition-all bg-[#0460A9] text-white hover:bg-[#03508C] shadow-md"
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 items-start max-w-[1600px] mx-auto pb-12">
      
      {/* LEFT COLUMN: Overview & Leaderboard */}
      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col gap-8">
        
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm font-semibold text-[#5D7EA1] hover:text-[#0460A9] transition group w-fit"
            >
              <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Quizzes Manager
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-[#5D7EA1] uppercase tracking-widest font-bold">Session ID</p>
              <p className="text-xs text-[#5D7EA1]/70 font-mono">{sessionId}</p>
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-[#16324F]">{session.name || session.quiz_name}</h1>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                session.status === 'opened' ? 'bg-[#0D8C6D]/10 text-[#0D8C6D] border-[#0D8C6D]/30' :
                session.status === 'started' ? 'bg-[#E67E22]/10 text-[#E67E22] border-[#E67E22]/30' :
                session.status === 'archived' ? 'bg-[#E74C3C]/10 text-[#E74C3C] border-[#E74C3C]/30' :
                'bg-[#5D7EA1]/10 text-[#5D7EA1] border-[#5D7EA1]/30'
              }`}>
                {session.status}
              </span>
            </div>
            <p className="text-sm font-medium text-[#5D7EA1]">Template: <span className="text-[#16324F] font-semibold">{session.quiz_name}</span></p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total Players', value: leaderboard.length, icon: '👥' },
            { label: 'Avg. Score', value: avgScore, icon: '🏆' },
            { label: 'Avg. Time', value: formatDuration(avgTimeMs), icon: '⏱️' },
            { label: 'Questions', value: questions.length, icon: '❓' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[20px] p-4 flex flex-col"
            >
              <div className="text-xl mb-1">{stat.icon}</div>
              <p className="text-[10px] font-bold text-[#5D7EA1] uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-[#16324F] mt-1">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Leaderboard Table */}
        <div className="mt-2">
          <h3 className="text-lg font-bold text-[#16324F] mb-4">Leaderboard</h3>
          <div className="overflow-x-auto bg-white rounded-[24px] border border-[#0460A9]/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#0460A9]/10 text-[10px] text-[#5D7EA1] uppercase tracking-[0.2em] font-bold bg-[#F8FAFC]">
                  <th className="py-4 px-5">Rank</th>
                  <th className="py-4 px-5">Player</th>
                  <th className="py-4 px-5 text-center">Score</th>
                  <th className="py-4 px-5 text-center">Correct</th>
                  <th className="py-4 px-5 text-center">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0460A9]/10">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#5D7EA1] italic">No players have finished this session yet.</td>
                  </tr>
                ) : (
                  leaderboard.map((entry, i) => (
                    <tr key={entry.id} className="hover:bg-[#F8FAFC] transition-colors group">
                      <td className="py-4 px-5">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-[#F1C40F]/10 text-[#F1C40F]' :
                          i === 1 ? 'bg-[#BDC3C7]/20 text-[#7F8C8D]' :
                          i === 2 ? 'bg-[#D35400]/10 text-[#D35400]' :
                          'bg-[#5D7EA1]/10 text-[#5D7EA1]'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <ProfileAvatar 
                            displayName={entry.user_display_name} 
                            photoURL={entry.profile_photo} 
                            size={28} 
                          />
                          <span className="font-semibold text-sm text-[#16324F]">{entry.user_display_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        <span className="font-bold text-[#0460A9]">{entry.total_score}</span>
                      </td>
                      <td className="py-4 px-5 text-center text-[#0D8C6D] font-medium text-sm">{entry.correct_count}</td>
                      <td className="py-4 px-5 text-center text-[#5D7EA1] text-xs">{formatDuration(entry.total_time_ms)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Question Breakdown */}
      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Insights</p>
          <h2 className="mt-2 text-2xl font-bold text-[#16324F]">Question Breakdown</h2>
          <p className="mt-2 text-sm text-[#5D7EA1]">Analyze player performance for each question.</p>
        </div>

        <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[24px] p-5">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="h-7 w-7 flex items-center justify-center rounded-lg bg-[#0460A9]/10 text-xs font-bold text-[#0460A9]">
                         {idx + 1}
                       </span>
                       <span className="px-2 py-0.5 rounded-md bg-[#5D7EA1]/10 text-[10px] text-[#5D7EA1] font-bold uppercase tracking-wider">
                         {q.node_type}
                       </span>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <p className="text-[9px] text-[#5D7EA1] uppercase tracking-widest font-bold">Responses</p>
                        <p className="text-sm font-bold text-[#16324F]">{q.total_responses}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-[#5D7EA1] uppercase tracking-widest font-bold">Avg Time</p>
                        <p className="text-sm font-bold text-[#16324F]">{formatDuration(q.avg_time_ms)}</p>
                      </div>
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-[#16324F] leading-snug">{q.question_text}</h3>
                </div>

                <div className="space-y-3">
                  {(q.choices || []).map((c) => {
                    const percentage = q.total_responses > 0 ? Math.round((c.count / q.total_responses) * 100) : 0;
                    return (
                      <div key={c.label} className="group relative">
                        <div className="flex items-center justify-between mb-1.5 px-1 relative z-10">
                           <div className="flex items-center gap-2">
                              <span className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold ${
                                c.is_correct ? 'bg-[#0D8C6D] text-white' : 'bg-[#5D7EA1]/20 text-[#16324F]'
                              }`}>
                                {c.label}
                              </span>
                              <span className={`text-sm ${c.is_correct ? 'text-[#0D8C6D] font-bold' : 'text-[#16324F] font-medium'}`}>
                                {c.text}
                              </span>
                           </div>
                           <div className="flex items-center gap-3">
                              <span className="text-[11px] font-medium text-[#5D7EA1]">{c.count}</span>
                              <span className="text-[11px] font-bold text-[#16324F] w-6 text-right">{percentage}%</span>
                           </div>
                        </div>
                        <div className="absolute inset-0 bg-transparent rounded-lg overflow-hidden border border-[#0460A9]/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: idx * 0.05 }}
                            className={`h-full opacity-20 ${c.is_correct ? 'bg-[#0D8C6D]' : 'bg-[#0460A9]'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
