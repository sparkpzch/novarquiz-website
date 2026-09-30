'use client';

import { useEffect, useState, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import type { Quiz } from '@/lib/types';
import type { CompareSessionsModalProps } from '@/components/admin/CompareSessionsModal';
import QuizOverallAnalyticsView, { type QuizOverallAnalyticsData } from '@/components/admin/QuizOverallAnalyticsView';

function QuizAnalyticsContent({ quizId }: { quizId: string }) {
  const router = useRouter();

  const [data, setData] = useState<QuizOverallAnalyticsData | null>(null);
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [allSessions, setAllSessions] = useState<CompareSessionsModalProps['allSessions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/admin/quizzes/${quizId}/analytics`).then(async (res) => {
        if (!res.ok) throw new Error('Failed to load quiz analytics');
        return res.json();
      }),
      fetch('/api/quizzes?all=true').then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch('/api/sessions').then((res) => (res.ok ? res.json() : [])).catch(() => []),
    ])
      .then(([analyticsRes, quizzesRes, sessionsRes]) => {
        if (cancelled) return;
        setData(analyticsRes);
        setAllQuizzes(quizzesRes || []);
        setAllSessions(sessionsRes || []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error('Error fetching quiz analytics:', err);
        setError(err.message || 'Failed to load quiz analytics');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [quizId]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0460A9] border-t-transparent" />
        <p className="text-sm font-semibold text-[#5D7EA1]">
          Consolidating multi-session telemetry for this quiz...
        </p>
      </div>
    );
  }

  if (error || !data || !data.quiz) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="nq-card rounded-[32px] p-10 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#16324F]">Quiz Analytics Unavailable</h2>
          <p className="mt-2 text-sm text-[#5D7EA1]">{error || 'Could not load comparative data for this quiz.'}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => router.push('/admin?tab=quizzes-manager')}
              className="rounded-[20px] bg-[#0460A9] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#03508C]"
            >
              Back to Quizzes Manager
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <QuizOverallAnalyticsView
      data={data}
      allQuizzes={allQuizzes}
      allSessions={allSessions}
      onBack={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/admin?tab=quizzes-manager');
        }
      }}
    />
  );
}

function QuizAnalyticsRoute({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  return <QuizAnalyticsContent key={quizId} quizId={quizId} />;
}

export default function QuizAnalyticsPage({ params }: { params: Promise<{ quizId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0460A9] border-t-transparent" />
        </div>
      }
    >
      <QuizAnalyticsRoute params={params} />
    </Suspense>
  );
}
