'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import { Card } from '@/components/ui/Card';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import type { LeaderboardEntry, Session } from '@/lib/types';

type UserHistoryRow = {
  session_id: string;
  session_name: string;
  session_description: string | null;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  total_time_ms: number | null;
  completed_at: string | null;
  rank: number;
  total_players: number;
};

function formatDuration(ms: number | null) {
  if (!ms || ms <= 0) return 'No timer';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Not finished';
  return new Date(dateString).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function HistoryPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');

  const [mine, setMine] = useState<UserHistoryRow[] | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sessionMeta, setSessionMeta] = useState<Session | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch personal history
  useEffect(() => {
    if (!user) return;
    fetch(`/api/users/${user.uid}/history`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setMine)
      .catch(() => setMine([]));
  }, [user]);

  // Fetch detail if session is selected
  useEffect(() => {
    if (!sessionParam) {
      setEntries([]);
      setSessionMeta(null);
      return;
    }

    setLoadingDetail(true);
    // Fetch leaderboard
    fetch(`/api/sessions/${sessionParam}/leaderboard`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        setEntries([...data].sort((a, b) => b.total_score - a.total_score));
      })
      .catch(() => setEntries([]));

    // Fetch session meta
    fetch(`/api/sessions/${sessionParam}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSessionMeta)
      .finally(() => setLoadingDetail(false));
  }, [sessionParam]);

  const totalAttempts = mine?.length ?? 0;
  const averageScore =
    mine && mine.length
      ? Math.round(mine.reduce((sum, row) => sum + row.total_score, 0) / mine.length)
      : 0;
  const bestRank =
    mine && mine.length ? Math.min(...mine.map((row) => row.rank)) : 0;

  // Handle Detail View
  if (sessionParam) {
    const sortedEntries = entries;
    const topThree = sortedEntries.slice(0, 3);
    const podium =
      topThree.length === 1
        ? [{ entry: topThree[0], rank: 1, height: 'h-40', featured: true, surface: 'from-[#055A9E] via-[#0460A9] to-[#92BFFF]' }]
        : topThree.length === 2
          ? [
              { entry: topThree[0], rank: 1, height: 'h-40', featured: true, surface: 'from-[#055A9E] via-[#0460A9] to-[#92BFFF]' },
              { entry: topThree[1], rank: 2, height: 'h-32', featured: false, surface: 'from-[#7AA7E7] to-[#C9DDF7]' },
            ]
          : [
              { entry: topThree[1], rank: 2, height: 'h-32', featured: false, surface: 'from-[#7AA7E7] to-[#C9DDF7]' },
              { entry: topThree[0], rank: 1, height: 'h-40', featured: true, surface: 'from-[#055A9E] via-[#0460A9] to-[#92BFFF]' },
              { entry: topThree[2], rank: 3, height: 'h-28', featured: false, surface: 'from-[#A9C6F4] to-[#DDEAFB]' },
            ];

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          onClick={() => router.push('/history')}
          className="group flex items-center gap-2 text-sm font-bold text-white transition hover:opacity-80"
        >
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to History
        </button>

        {loadingDetail ? (
          <div className="flex justify-center py-20">
             <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : (
          <>
            <section className="nq-card rounded-[34px] p-6 md:p-8">
              <div className="flex flex-col gap-5 border-b border-[#0460A9]/10 pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="nq-details font-bold text-[#5D7EA1]">Session Detail</p>
                  <h1 className="mt-2 text-3xl font-bold text-[#16324F] font-display tracking-tight">
                    {sessionMeta?.name || 'Leaderboard'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#5D7EA1] font-medium">
                    {sessionMeta?.description || 'Review the final rankings and podium for this quiz session.'}
                  </p>
                </div>
                <div className="rounded-[24px] bg-[#EAF5FF] px-5 py-4 text-right border border-[#0460A9]/08">
                  <p className="nq-details font-bold text-[#5D7EA1]">Final Players</p>
                  <p className="mt-2 text-2xl font-bold text-[#0460A9] font-display">{entries.length}</p>
                </div>
              </div>

              {entries.length > 0 && (
                <div className="mt-8 flex items-end justify-center gap-4">
                  {podium.map(({ entry, rank, height, surface, featured }) => (
                    <div key={entry.user_id} className="flex w-24 flex-col items-center">
                      <div className="mb-3 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[#5D7EA1]">#{rank}</div>
                      <ProfileAvatar
                        displayName={entry.user_display_name}
                        photoURL={entry.user_photo_url}
                        size={featured ? 68 : 56}
                        ringClassName="ring-4 ring-[#DDF0FF] shadow-lg shadow-[#113D7A]/14"
                      />
                      <p className="mt-3 w-full truncate text-center text-xs font-bold text-[#16324F]">{entry.user_display_name}</p>
                      <p className="mt-1 text-xs font-bold text-[#0460A9]">{entry.total_score} pts</p>
                      <div className={`mt-4 flex w-full items-start justify-center rounded-t-[28px] bg-gradient-to-b ${surface} pt-4 text-xl font-bold ${featured ? 'text-white' : 'text-[#16324F]'} ${height}`}>
                        {rank}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="nq-card rounded-[34px] p-4 md:p-6">
              <h2 className="mb-4 px-2 text-xl font-bold text-[#16324F] font-display">Full Standings</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#0460A9]/10 text-[#5D7EA1]">
                      <th className="px-4 py-3 text-left font-bold">Rank</th>
                      <th className="px-4 py-3 text-left font-bold">Player</th>
                      <th className="px-4 py-3 text-right font-bold">Score</th>
                      <th className="hidden px-4 py-3 text-right font-bold sm:table-cell">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map((entry, idx) => (
                      <tr key={entry.user_id} className={`border-b border-[#0460A9]/05 ${entry.user_id === user?.uid ? 'bg-[#0460A9]/05' : 'hover:bg-white/40'}`}>
                        <td className="px-4 py-3 font-bold text-[#5D7EA1]">#{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={32} />
                            <span className="font-bold text-[#16324F]">{entry.user_id === user?.uid ? 'You' : entry.user_display_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#0460A9]">{entry.total_score}</td>
                        <td className="hidden px-4 py-3 text-right font-medium text-[#5D7EA1] sm:table-cell">
                          {Math.round((entry.correct_count / (entry.correct_count + entry.incorrect_count || 1)) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  // Main History List
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="nq-card relative overflow-hidden rounded-[34px] p-6 md:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.38),transparent_65%)]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="nq-details font-bold text-[#5D7EA1]">NovarQuiz archive</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F] md:text-4xl font-display tracking-tight">{t('leaderboard.title')}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#5D7EA1] font-medium">
              Track your finished attempts, review scores, placements, and streaks from all your completed quiz sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[440px]">
            <Card.Tile
              label="Attempts"
              value={totalAttempts}
            />
            <Card.Tile
              label="Avg score"
              value={averageScore}
            />
            <Card.Tile
              label="Best rank"
              value={bestRank ? `#${bestRank}` : '--'}
            />
          </div>
        </div>
      </section>

      <div className="space-y-4">
          {!user ? (
            <div className="nq-card rounded-[34px] p-10 text-center">
              <p className="text-lg font-bold text-[#16324F] font-display">Sign in to see your attempts.</p>
              <p className="mt-2 text-sm text-[#5D7EA1] font-medium">Finished quizzes linked to your account will appear here.</p>
            </div>
          ) : mine === null ? (
            <div className="flex justify-center py-14">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
            </div>
          ) : mine.length === 0 ? (
            <div className="nq-card rounded-[34px] p-10 text-center">
              <p className="text-lg font-bold text-[#16324F] font-display">You have not finished any sessions yet.</p>
              <p className="mt-2 text-sm text-[#5D7EA1] font-medium">Complete a quiz and this page will turn into your personal record board.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mine.map((row, index) => (
                <Card
                  key={`${row.session_id}-${row.completed_at ?? index}`}
                  onClick={() => router.push(`/history?session=${row.session_id}`)}
                  variant="soft"
                  className="w-full !p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#0460A9]/10 px-3 py-1 nq-details font-bold text-[#0460A9]">
                          Attempt
                        </span>
                        <span className="text-sm font-bold text-[#5D7EA1]">{formatDate(row.completed_at)}</span>
                      </div>
                      <h2 className="mt-3 truncate text-xl font-bold text-[#16324F] font-display">{row.session_name}</h2>
                      <p className="mt-2 text-sm text-[#5D7EA1] font-medium line-clamp-2">
                        {row.session_description || 'Completed session overview with your score, placement, and streak.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                      <Card.Tile label="Score" value={row.total_score} />
                      <Card.Tile
                        label="Rank"
                        value={
                          <span className="font-display">
                            #{row.rank}
                            <span className="text-sm font-medium text-[#5D7EA1]">/{row.total_players}</span>
                          </span>
                        }
                      />
                      <Card.Tile label="Correct" value={row.correct_count} className="[&_p:last-child]:text-[#0D8C6D]" />
                      <Card.Tile label="Streak" value={row.streak} className="[&_p:last-child]:text-[#E67E22]" />
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[#0460A9]/10 pt-4">
                    <p className="text-sm text-[#5D7EA1] font-medium">Completion time: {formatDuration(row.total_time_ms)}</p>
                    <span className="text-sm font-bold text-[#0460A9] font-display">View Standings →</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <HistoryPageContent />
    </Suspense>
  );
}
