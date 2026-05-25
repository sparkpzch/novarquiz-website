'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import type { HcpVectorMap } from '@/lib/analytics/hcp';
import { Session, LeaderboardEntry } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

interface QuestionAnalytic {
  id: string;
  question_text: string;
  question_order: number;
  node_type: string;
  intended_audience: string;
  presentation_mode: string;
  reading_level: string | null;
  total_responses: number;
  avg_time_ms: number;
  node_friction_score: number;
  content_quality_flag: string;
  choices: Array<{
    label: string;
    text: string;
    is_correct: boolean;
    count: number;
    behavior_meaning?: string | null;
    allowed_usage?: string;
  }>;
}

interface AnalyticsData {
  session: Session & {
    quiz_name: string;
    quiz_description: string;
    intended_audience?: string;
    presentation_mode?: string;
  };
  leaderboard: (LeaderboardEntry & { profile_photo?: string })[];
  questions: QuestionAnalytic[];
  insights: {
    audience_mode_summary: Record<string, number>;
    archetype_distribution: Array<{ archetype_id: string; count: number }>;
    vector_summary: HcpVectorMap;
    dominant_vector: string;
    highest_friction_nodes: Array<{
      question_id: string;
      question_text: string;
      node_friction_score: number;
    }>;
  };
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export default function SessionAnalyticsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <div className="text-4xl mb-4">Error</div>
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

  const { session, leaderboard, questions, insights } = data;
  const avgScore = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((sum, row) => sum + row.total_score, 0) / leaderboard.length)
    : 0;
  const avgTimeMs = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((sum, row) => sum + row.total_time_ms, 0) / leaderboard.length)
    : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 items-start max-w-[1600px] mx-auto pb-12">
      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm font-semibold text-[#5D7EA1] hover:text-[#0460A9] transition group w-fit"
            >
              <span>Back</span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-[#5D7EA1] uppercase tracking-widest font-bold">Session ID</p>
              <p className="text-xs text-[#5D7EA1]/70 font-mono">{sessionId}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-[#16324F]">{session.name || session.quiz_name}</h1>
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-[#5D7EA1]/10 text-[#5D7EA1] border-[#5D7EA1]/30">
                {session.status}
              </span>
            </div>
            <p className="text-sm font-medium text-[#5D7EA1]">
              Template: <span className="text-[#16324F] font-semibold">{session.quiz_name}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total Players', value: leaderboard.length },
            { label: 'Avg. Score', value: avgScore },
            { label: 'Avg. Time', value: formatDuration(avgTimeMs) },
            { label: 'Questions', value: questions.length },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[20px] p-4"
            >
              <p className="text-[10px] font-bold text-[#5D7EA1] uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-[#16324F] mt-1">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[20px] p-4">
            <p className="text-[10px] font-bold text-[#5D7EA1] uppercase tracking-widest">Dominant Vector</p>
            <p className="mt-2 text-lg font-bold text-[#16324F]">{insights.dominant_vector}</p>
            <div className="mt-3 space-y-1 text-xs text-[#5D7EA1]">
              {Object.entries(insights.vector_summary).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{key}</span>
                  <span className="font-semibold text-[#16324F]">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[20px] p-4">
            <p className="text-[10px] font-bold text-[#5D7EA1] uppercase tracking-widest">Audience Modes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(insights.audience_mode_summary).map(([key, value]) => (
                <span key={key} className="rounded-full bg-white px-3 py-1 border border-[#0460A9]/10 text-xs font-semibold text-[#16324F]">
                  {key}: {value}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[10px] font-bold text-[#5D7EA1] uppercase tracking-widest">Highest Friction</p>
            <div className="mt-2 space-y-2">
              {insights.highest_friction_nodes.slice(0, 3).map((node) => (
                <div key={node.question_id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-[#16324F]">{node.question_text}</span>
                  <span className="font-bold text-[#0460A9]">{node.node_friction_score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[24px] border border-[#0460A9]/10 p-5">
          <h3 className="text-lg font-bold text-[#16324F] mb-4">Archetype Distribution</h3>
          <div className="space-y-3">
            {insights.archetype_distribution.length === 0 ? (
              <p className="text-sm text-[#5D7EA1]">No completed profiles yet.</p>
            ) : (
              insights.archetype_distribution.map((row) => (
                <div key={row.archetype_id} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#16324F]">{row.archetype_id}</span>
                  <span className="text-sm font-bold text-[#0460A9]">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-[#16324F] mb-4">Leaderboard</h3>
          <div className="overflow-x-auto bg-white rounded-[24px] border border-[#0460A9]/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#0460A9]/10 text-[10px] text-[#5D7EA1] uppercase tracking-[0.2em] font-bold bg-[#F8FAFC]">
                  <th className="py-4 px-5">Rank</th>
                  <th className="py-4 px-5">Player</th>
                  <th className="py-4 px-5 text-center">Score</th>
                  <th className="py-4 px-5 text-center">Time</th>
                  <th className="py-4 px-5 text-center">Archetype</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0460A9]/10">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#5D7EA1] italic">No players have finished this session yet.</td>
                  </tr>
                ) : (
                  leaderboard.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-4 px-5 text-[#16324F] font-semibold">{index + 1}</td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.profile_photo} size={28} />
                          <span className="font-semibold text-sm text-[#16324F]">{entry.user_display_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center font-bold text-[#0460A9]">{entry.total_score}</td>
                      <td className="py-4 px-5 text-center text-[#5D7EA1] text-xs">{formatDuration(entry.total_time_ms)}</td>
                      <td className="py-4 px-5 text-center text-[#16324F] text-xs font-semibold">{entry.archetype_id ?? 'n/a'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Insights</p>
          <h2 className="mt-2 text-2xl font-bold text-[#16324F]">Question Breakdown</h2>
          <p className="mt-2 text-sm text-[#5D7EA1]">Analyze friction, audience-fit, and choice meaning for each question.</p>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.id} className="bg-[#F8FAFC] border border-[#0460A9]/10 rounded-[24px] p-5">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-7 w-7 flex items-center justify-center rounded-lg bg-[#0460A9]/10 text-xs font-bold text-[#0460A9]">
                      {index + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#5D7EA1]/10 text-[10px] text-[#5D7EA1] font-bold uppercase tracking-wider">
                      {question.node_type}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-right">
                      <p className="text-[9px] text-[#5D7EA1] uppercase tracking-widest font-bold">Responses</p>
                      <p className="text-sm font-bold text-[#16324F]">{question.total_responses}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-[#5D7EA1] uppercase tracking-widest font-bold">Avg Time</p>
                      <p className="text-sm font-bold text-[#16324F]">{formatDuration(question.avg_time_ms)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-[#5D7EA1] uppercase tracking-widest font-bold">Friction</p>
                      <p className="text-sm font-bold text-[#16324F]">{question.node_friction_score}</p>
                    </div>
                  </div>
                </div>
                <h3 className="text-base font-semibold text-[#16324F] leading-snug">{question.question_text}</h3>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-1 rounded-full bg-white border border-[#0460A9]/10 text-[#0460A9] font-bold">{question.intended_audience}</span>
                  <span className="px-2 py-1 rounded-full bg-white border border-[#0460A9]/10 text-[#0460A9] font-bold">{question.presentation_mode}</span>
                  {question.reading_level && (
                    <span className="px-2 py-1 rounded-full bg-white border border-[#0460A9]/10 text-[#5D7EA1] font-semibold">{question.reading_level}</span>
                  )}
                  <span className="px-2 py-1 rounded-full bg-white border border-[#0460A9]/10 text-[#5D7EA1] font-semibold">{question.content_quality_flag}</span>
                </div>
              </div>

              <div className="space-y-3">
                {(question.choices || []).map((choice) => {
                  const percentage = question.total_responses > 0
                    ? Math.round((choice.count / question.total_responses) * 100)
                    : 0;

                  return (
                    <div key={choice.label} className="relative">
                      <div className="flex items-center justify-between mb-1.5 px-1 relative z-10">
                        <div className="flex items-center gap-2">
                          <span className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold ${
                            choice.is_correct ? 'bg-[#0D8C6D] text-white' : 'bg-[#5D7EA1]/20 text-[#16324F]'
                          }`}>
                            {choice.label}
                          </span>
                          <span className={`text-sm ${choice.is_correct ? 'text-[#0D8C6D] font-bold' : 'text-[#16324F] font-medium'}`}>
                            {choice.text}
                          </span>
                          {choice.behavior_meaning && (
                            <span className="text-[10px] text-[#5D7EA1] hidden md:inline">· {choice.behavior_meaning}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {choice.allowed_usage && (
                            <span className="text-[10px] uppercase text-[#5D7EA1]">{choice.allowed_usage}</span>
                          )}
                          <span className="text-[11px] font-medium text-[#5D7EA1]">{choice.count}</span>
                          <span className="text-[11px] font-bold text-[#16324F] w-6 text-right">{percentage}%</span>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-transparent rounded-lg overflow-hidden border border-[#0460A9]/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.04 }}
                          className={`h-full opacity-20 ${choice.is_correct ? 'bg-[#0D8C6D]' : 'bg-[#0460A9]'}`}
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
