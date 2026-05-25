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
    score_impact: number;
    count: number;
    behavior_meaning?: string | null;
    clinical_tags?: string[];
    confidence_weight?: number;
    allowed_usage?: string;
    review_status?: string;
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

function formatImpact(scoreImpact: number) {
  if (scoreImpact > 0) return `+${scoreImpact}`;
  if (scoreImpact < 0) return `${scoreImpact}`;
  return '0';
}

function impactTheme(scoreImpact: number) {
  if (scoreImpact > 0) return 'bg-[#0D8C6D] text-white';
  if (scoreImpact < 0) return 'bg-[#D63A3D] text-white';
  return 'bg-[#FFB020]/20 text-[#8A5A00]';
}

function impactFill(scoreImpact: number) {
  if (scoreImpact > 0) return 'bg-[#0D8C6D]';
  if (scoreImpact < 0) return 'bg-[#D63A3D]';
  return 'bg-[#FFB020]';
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
        <div className="mb-4 text-4xl">Error</div>
        <h2 className="mb-2 text-xl font-bold text-[#16324F]">Failed to load analytics</h2>
        <p className="mb-6 text-[#5D7EA1]">{error || 'Session not found'}</p>
        <button
          onClick={() => router.back()}
          className="rounded-[22px] bg-[#0460A9] px-6 py-2.5 font-semibold text-white shadow-md transition-all hover:bg-[#03508C]"
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
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-start gap-6 pb-12 xl:grid-cols-2 lg:gap-8">
      <div className="nq-card flex flex-col gap-6 rounded-[34px] p-5 md:p-6 lg:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="group w-fit text-sm font-semibold text-[#5D7EA1] transition hover:text-[#0460A9]"
            >
              Back
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5D7EA1]">Session ID</p>
              <p className="font-mono text-xs text-[#5D7EA1]/70">{sessionId}</p>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#16324F] md:text-3xl">{session.name || session.quiz_name}</h1>
              <span className="rounded-full border border-[#5D7EA1]/30 bg-[#5D7EA1]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
                {session.status}
              </span>
            </div>
            <p className="text-sm font-medium text-[#5D7EA1]">
              Template: <span className="font-semibold text-[#16324F]">{session.quiz_name}</span>
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
              className="rounded-[20px] border border-[#0460A9]/10 bg-[#F8FAFC] p-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5D7EA1]">{stat.label}</p>
              <p className="mt-1 text-xl font-bold text-[#16324F]">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-[#0460A9]/10 bg-[#F8FAFC] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#5D7EA1]">Dominant Vector</p>
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
          <div className="rounded-[20px] border border-[#0460A9]/10 bg-[#F8FAFC] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#5D7EA1]">Audience Modes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(insights.audience_mode_summary).map(([key, value]) => (
                <span key={key} className="rounded-full border border-[#0460A9]/10 bg-white px-3 py-1 text-xs font-semibold text-[#16324F]">
                  {key}: {value}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[#5D7EA1]">Highest Friction</p>
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

        <div className="rounded-[24px] border border-[#0460A9]/10 bg-white p-5">
          <h3 className="mb-4 text-lg font-bold text-[#16324F]">Archetype Distribution</h3>
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
          <h3 className="mb-4 text-lg font-bold text-[#16324F]">Leaderboard</h3>
          <div className="overflow-x-auto rounded-[24px] border border-[#0460A9]/10 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#0460A9]/10 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-[0.2em] text-[#5D7EA1]">
                  <th className="px-5 py-4">Rank</th>
                  <th className="px-5 py-4">Player</th>
                  <th className="px-5 py-4 text-center">Score</th>
                  <th className="px-5 py-4 text-center">Time</th>
                  <th className="px-5 py-4 text-center">Archetype</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0460A9]/10">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center italic text-[#5D7EA1]">
                      No players have finished this session yet.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((entry, index) => (
                    <tr key={entry.id} className="transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-5 py-4 font-semibold text-[#16324F]">{index + 1}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.profile_photo} size={28} />
                          <span className="text-sm font-semibold text-[#16324F]">{entry.user_display_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center font-bold text-[#0460A9]">{entry.total_score}</td>
                      <td className="px-5 py-4 text-center text-xs text-[#5D7EA1]">{formatDuration(entry.total_time_ms)}</td>
                      <td className="px-5 py-4 text-center text-xs font-semibold text-[#16324F]">{entry.archetype_id ?? 'n/a'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="nq-card flex flex-col gap-6 rounded-[34px] p-5 md:p-6 lg:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Insights</p>
          <h2 className="mt-2 text-2xl font-bold text-[#16324F]">Question Breakdown</h2>
          <p className="mt-2 text-sm text-[#5D7EA1]">
            Analyze friction, audience-fit, and outcome weighting for each question.
          </p>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.id} className="rounded-[24px] border border-[#0460A9]/10 bg-[#F8FAFC] p-5">
              <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0460A9]/10 text-xs font-bold text-[#0460A9]">
                      {index + 1}
                    </span>
                    <span className="rounded-md bg-[#5D7EA1]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
                      {question.node_type}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#5D7EA1]">Responses</p>
                      <p className="text-sm font-bold text-[#16324F]">{question.total_responses}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#5D7EA1]">Avg Time</p>
                      <p className="text-sm font-bold text-[#16324F]">{formatDuration(question.avg_time_ms)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#5D7EA1]">Friction</p>
                      <p className="text-sm font-bold text-[#16324F]">{question.node_friction_score}</p>
                    </div>
                  </div>
                </div>
                <h3 className="text-base font-semibold leading-snug text-[#16324F]">{question.question_text}</h3>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-full border border-[#0460A9]/10 bg-white px-2 py-1 font-bold text-[#0460A9]">
                    {question.intended_audience}
                  </span>
                  <span className="rounded-full border border-[#0460A9]/10 bg-white px-2 py-1 font-bold text-[#0460A9]">
                    {question.presentation_mode}
                  </span>
                  {question.reading_level && (
                    <span className="rounded-full border border-[#0460A9]/10 bg-white px-2 py-1 font-semibold text-[#5D7EA1]">
                      {question.reading_level}
                    </span>
                  )}
                  <span className="rounded-full border border-[#0460A9]/10 bg-white px-2 py-1 font-semibold text-[#5D7EA1]">
                    {question.content_quality_flag}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {(question.choices || []).map((choice) => {
                  const percentage = question.total_responses > 0
                    ? Math.round((choice.count / question.total_responses) * 100)
                    : 0;

                  return (
                    <div key={choice.label} className="relative">
                      <div className="relative z-10 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#5D7EA1]/20 text-[9px] font-bold text-[#16324F]">
                            {choice.label}
                          </span>
                          <span className="text-sm font-medium text-[#16324F]">{choice.text}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${impactTheme(choice.score_impact)}`}>
                            {formatImpact(choice.score_impact)}
                          </span>
                          {choice.behavior_meaning && (
                            <span className="hidden text-[10px] text-[#5D7EA1] md:inline">· {choice.behavior_meaning}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {typeof choice.confidence_weight === 'number' && (
                            <span className="text-[10px] text-[#5D7EA1]">impact {choice.confidence_weight}</span>
                          )}
                          {choice.allowed_usage && (
                            <span className="text-[10px] uppercase text-[#5D7EA1]">{choice.allowed_usage}</span>
                          )}
                          {choice.review_status && (
                            <span className="text-[10px] uppercase text-[#5D7EA1]">{choice.review_status}</span>
                          )}
                          <span className="text-[11px] font-medium text-[#5D7EA1]">{choice.count}</span>
                          <span className="w-6 text-right text-[11px] font-bold text-[#16324F]">{percentage}%</span>
                        </div>
                      </div>
                      {choice.clinical_tags && choice.clinical_tags.length > 0 && (
                        <div className="relative z-10 mt-1 flex flex-wrap gap-1 px-1">
                          {choice.clinical_tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#5D7EA1]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="absolute inset-0 overflow-hidden rounded-lg border border-[#0460A9]/5 bg-transparent">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.04 }}
                          className={`h-full opacity-20 ${impactFill(choice.score_impact)}`}
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
