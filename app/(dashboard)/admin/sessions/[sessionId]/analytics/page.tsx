'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Session, LeaderboardEntry, Quiz } from '@/lib/types';
import MedicalAnalyticsDashboard from '@/components/admin/MedicalAnalyticsDashboard';
import type { CompareSessionsModalProps } from '@/components/admin/CompareSessionsModal';

interface AnalyticsData {
  session: Session & {
    quiz_name: string;
    quiz_description: string;
  };
  leaderboard: (LeaderboardEntry & { profile_photo?: string })[];
  questions: Array<{
    id: string;
    question_text: string;
    node_type: string;
    total_responses: number;
    avg_time_ms: number;
    node_friction_score: number;
  }>;
  insight_breakdown?: Array<{
    user_id: string;
    user_display_name: string | null;
    answered: number;
    missed: number;
    gap_tags: string[];
    headline: string | null;
    suggestion: string | null;
  }>;
  peer_sessions?: Array<{
    id: string;
    name: string;
    pin_code?: string;
    status?: string;
    started_at?: string;
    ended_at?: string;
    participant_count?: number;
    avg_score?: number;
  }>;
  insights: {
    audience_mode_summary: Record<string, number>;
    highest_friction_nodes: Array<{
      question_id: string;
      question_text: string;
      node_friction_score: number;
    }>;
  };
}

export default function SessionAnalyticsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [allSessions, setAllSessions] = useState<CompareSessionsModalProps['allSessions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/sessions/${sessionId}/analytics`).then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
      }),
      fetch('/api/quizzes?all=true').then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch('/api/sessions').then((res) => (res.ok ? res.json() : [])).catch(() => []),
    ])
      .then(([analyticsRes, quizzesRes, sessionsRes]) => {
        setData(analyticsRes);
        setAllQuizzes(quizzesRes || []);
        setAllSessions(sessionsRes || []);
      })
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
  const insightBreakdown = data.insight_breakdown ?? [];
  const peerSessions = data.peer_sessions ?? [];

  return (
    <div className="mx-auto max-w-[1600px]">
      <MedicalAnalyticsDashboard
        session={session}
        leaderboard={leaderboard}
        questions={questions}
        insights={insights}
        insightBreakdown={insightBreakdown}
        peerSessions={peerSessions}
        allQuizzes={allQuizzes}
        allSessions={allSessions}
        onBack={() => router.back()}
      />
    </div>
  );
}
