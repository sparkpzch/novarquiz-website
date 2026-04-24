'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { AnimatePresence, motion } from 'motion/react';
import type { LeaderboardEntry, Quiz } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

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

type Tab = 'session' | 'mine';

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
  const [tab, setTab] = useState<Tab>(searchParams.get('session') ? 'session' : 'mine');
  const [sessions, setSessions] = useState<Quiz[]>([]);
  const [selectedSession, setSelectedSession] = useState(searchParams.get('session') || '');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [mine, setMine] = useState<UserHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(Boolean(searchParams.get('session')));

  useEffect(() => {
    fetch('/api/questions/sessions')
      .then((response) => (response.ok ? response.json() : []))
      .then(setSessions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    fetch(`/api/play/${selectedSession}/leaderboard`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [selectedSession]);

  useEffect(() => {
    if (tab !== 'mine' || !user) return;
    fetch(`/api/play/me/history?uid=${encodeURIComponent(user.uid)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setMine)
      .catch(() => setMine([]));
  }, [tab, user]);

  const sortedEntries = [...entries].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (a.total_time_ms !== b.total_time_ms) return a.total_time_ms - b.total_time_ms;
    return a.user_display_name.localeCompare(b.user_display_name);
  });
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
  const myEntry = sortedEntries.find((entry) => entry.user_id === user?.uid);
  const myRank = sortedEntries.findIndex((entry) => entry.user_id === user?.uid) + 1;
  const selectedSessionMeta = sessions.find((session) => session.id === selectedSession);

  const totalAttempts = mine?.length ?? 0;
  const averageScore =
    mine && mine.length
      ? Math.round(mine.reduce((sum, row) => sum + row.total_score, 0) / mine.length)
      : 0;
  const bestRank =
    mine && mine.length ? Math.min(...mine.map((row) => row.rank)) : 0;
  const sessionBestScore =
    sortedEntries.length ? Math.max(...sortedEntries.map((entry) => entry.total_score)) : 0;

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    if (nextTab === 'mine') {
      setSelectedSession('');
      router.replace('/history');
      return;
    }
    router.replace(selectedSession ? `/history?session=${selectedSession}` : '/history');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="nq-card relative overflow-hidden rounded-[34px] p-6 md:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.38),transparent_65%)]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">NovarQuiz archive</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F] md:text-4xl">{t('leaderboard.title')}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#5D7EA1]">
              Track your finished attempts or open any completed session to review standings,
              streaks, and score spread in the Angular-blue dashboard style.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[440px]">
            <div className="rounded-[24px] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5D7EA1]">
                {tab === 'mine' ? 'Attempts' : 'Players'}
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0460A9]">
                {tab === 'mine' ? totalAttempts : entries.length}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5D7EA1]">
                {tab === 'mine' ? 'Avg score' : 'Best score'}
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0460A9]">
                {tab === 'mine' ? averageScore : sessionBestScore}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5D7EA1]">
                {tab === 'mine' ? 'Best rank' : 'Your place'}
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0460A9]">
                {tab === 'mine' ? (bestRank ? `#${bestRank}` : '--') : myEntry ? `#${myRank}` : '--'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="nq-card rounded-[30px] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="relative inline-flex rounded-[24px] bg-[#EAF5FF] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            {(['mine', 'session'] as Tab[]).map((item) => {
              const active = tab === item;
              return (
                <button
                  key={item}
                  onClick={() => switchTab(item)}
                  className={`relative z-10 rounded-[20px] px-5 py-2.5 text-sm font-semibold transition-colors ${
                    active ? 'text-white' : 'text-[#456786]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="history-tab-pill"
                      className="absolute inset-0 rounded-[20px] bg-linear-to-r from-[#055A9E] via-[#0460A9] to-[#92BFFF]"
                      transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10">{item === 'mine' ? 'My attempts' : 'By session'}</span>
                </button>
              );
            })}
          </div>

          <div className="w-full lg:ml-auto lg:max-w-xl lg:min-h-[84px]">
            {tab === 'session' ? (
              <>
                <label className="mb-2 block text-sm font-semibold text-[#16324F]">
                  {t('leaderboard.select_session')}
                </label>
                <select
                  value={selectedSession}
                  onChange={(event) => {
                    const nextSession = event.target.value;
                    setLoading(Boolean(nextSession));
                    setSelectedSession(nextSession);
                    router.replace(nextSession ? `/history?session=${nextSession}` : '/history');
                  }}
                  className="w-full rounded-[22px] border border-[#0460A9]/12 bg-white/85 px-4 py-3 text-[#16324F] outline-none transition focus:border-[#0460A9]/40"
                >
                  <option value="">{t('leaderboard.select_session')}</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <div
                aria-hidden="true"
                className="hidden h-[84px] rounded-[22px] lg:block"
              />
            )}
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'mine' ? (
          <motion.div
            key="mine-tab"
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {!user ? (
              <div className="nq-card rounded-[34px] p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">Sign in to see your attempts.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">Finished quizzes linked to your account will appear here.</p>
              </div>
            ) : mine === null ? (
              <div className="flex justify-center py-14">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
              </div>
            ) : mine.length === 0 ? (
              <div className="nq-card rounded-[34px] p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">You have not finished any sessions yet.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">Complete a quiz and this page will turn into your personal record board.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {mine.map((row, index) => (
                  <motion.button
                    key={`${row.session_id}-${row.completed_at ?? index}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => {
                      setLoading(true);
                      setSelectedSession(row.session_id);
                      setTab('session');
                      router.replace(`/history?session=${row.session_id}`);
                    }}
                    className="nq-card-soft w-full rounded-[30px] p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(17,87,145,0.18)]"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#0460A9]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0460A9]">
                            Attempt
                          </span>
                          <span className="text-sm font-medium text-[#5D7EA1]">{formatDate(row.completed_at)}</span>
                        </div>
                        <h2 className="mt-3 truncate text-xl font-bold text-[#16324F]">{row.session_name}</h2>
                        <p className="mt-2 text-sm text-[#5D7EA1]">
                          {row.session_description || 'Completed session overview with your score, placement, and streak.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                        <div className="rounded-[24px] bg-white/82 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Score</p>
                          <p className="mt-2 text-xl font-bold text-[#0460A9]">{row.total_score}</p>
                        </div>
                        <div className="rounded-[24px] bg-white/82 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Rank</p>
                          <p className="mt-2 text-xl font-bold text-[#16324F]">
                            #{row.rank}
                            <span className="text-sm font-medium text-[#5D7EA1]">/{row.total_players}</span>
                          </p>
                        </div>
                        <div className="rounded-[24px] bg-white/82 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Correct</p>
                          <p className="mt-2 text-xl font-bold text-[#0D8C6D]">
                            {row.correct_count}/{row.correct_count + row.incorrect_count}
                          </p>
                        </div>
                        <div className="rounded-[24px] bg-white/82 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Streak</p>
                          <p className="mt-2 text-xl font-bold text-[#E67E22]">{row.streak}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[#0460A9]/10 pt-4">
                      <p className="text-sm text-[#5D7EA1]">Completion time: {formatDuration(row.total_time_ms)}</p>
                      <span className="text-sm font-semibold text-[#0460A9]">Open session history</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="session-tab"
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {!selectedSession ? (
              <div className="nq-card rounded-[34px] p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">Select a quiz session to view history.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">The session leaderboard, podium, and detailed rankings will appear here.</p>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-14">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
              </div>
            ) : entries.length === 0 ? (
              <div className="nq-card rounded-[34px] p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">No entries yet for this session.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">When players finish the quiz, the standings will show up here.</p>
              </div>
            ) : (
              <>
                <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                  <div className="nq-card rounded-[34px] p-6 md:p-8">
                    <div className="flex flex-col gap-5 border-b border-[#0460A9]/10 pb-5 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Session leaderboard</p>
                        <h2 className="mt-2 text-2xl font-bold text-[#16324F]">
                          {selectedSessionMeta?.name || t('leaderboard.title')}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm text-[#5D7EA1]">
                          {selectedSessionMeta?.description || 'Review the final order, score gaps, and streak performance for this completed quiz.'}
                        </p>
                      </div>
                      <div className="rounded-[24px] bg-[#EAF5FF] px-4 py-3 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7EA1]">Players finished</p>
                        <p className="mt-2 text-2xl font-bold text-[#0460A9]">{entries.length}</p>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-col items-center justify-center gap-6 md:flex-row md:items-end">
                      {podium.map(({ entry, rank, height, surface, featured }, index) => {
                        return (
                          <motion.div
                            key={entry.user_id}
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.08 }}
                            className="flex flex-col items-center"
                          >
                            <div className="mb-3 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#5D7EA1]">
                              #{rank}
                            </div>
                            <ProfileAvatar
                              displayName={entry.user_display_name}
                              photoURL={entry.user_photo_url}
                              size={featured ? 88 : 72}
                              ringClassName="ring-4 ring-[#DDF0FF] shadow-[0_16px_28px_rgba(17,87,145,0.14)]"
                            />
                            <p className="mt-3 max-w-[156px] truncate text-center text-base font-bold text-[#16324F]">
                              {entry.user_display_name}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#0460A9]">{entry.total_score} pts</p>
                            <div className={`mt-4 flex w-28 items-start justify-center rounded-t-[28px] bg-linear-to-b ${surface} pt-4 text-xl font-bold ${featured ? 'text-white' : 'text-[#16324F]'} ${height}`}>
                              {rank}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <section className="nq-card-blue rounded-[30px] p-5 text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/75">Top score</p>
                      <p className="mt-3 text-3xl font-bold">{sessionBestScore}</p>
                      <p className="mt-2 text-sm text-white/80">
                        Leading score in this finished session.
                      </p>
                    </section>

                    {myEntry ? (
                      <section className="nq-card rounded-[30px] p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">
                          {t('leaderboard.your_result')}
                        </p>
                        <div className="mt-4 flex items-center gap-4">
                          <ProfileAvatar
                            displayName={myEntry.user_display_name}
                            photoURL={myEntry.user_photo_url}
                            size={56}
                            ringClassName="ring-4 ring-white/80 shadow-md shadow-[#0460A9]/20"
                          />
                          <div>
                            <p className="text-lg font-bold text-[#16324F]">#{myRank}</p>
                            <p className="text-sm text-[#5D7EA1]">{myEntry.user_display_name}</p>
                          </div>
                        </div>
                        <div className="mt-5 grid grid-cols-3 gap-3">
                          <div className="rounded-[20px] bg-white/72 px-3 py-3 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5D7EA1]">Score</p>
                            <p className="mt-2 text-lg font-bold text-[#0460A9]">{myEntry.total_score}</p>
                          </div>
                          <div className="rounded-[20px] bg-white/72 px-3 py-3 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5D7EA1]">Correct</p>
                            <p className="mt-2 text-lg font-bold text-[#0D8C6D]">
                              {myEntry.correct_count}/{myEntry.correct_count + myEntry.incorrect_count}
                            </p>
                          </div>
                          <div className="rounded-[20px] bg-white/72 px-3 py-3 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5D7EA1]">Streak</p>
                            <p className="mt-2 text-lg font-bold text-[#E67E22]">{myEntry.streak}</p>
                          </div>
                        </div>
                      </section>
                    ) : (
                      <section className="nq-card-soft rounded-[30px] p-5">
                        <p className="text-lg font-semibold text-[#16324F]">You did not appear in this session.</p>
                        <p className="mt-2 text-sm text-[#5D7EA1]">Join the next run to compare your score with the full leaderboard here.</p>
                      </section>
                    )}
                  </div>
                </section>

                <section className="nq-card rounded-[34px] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Full standings</p>
                      <h3 className="mt-2 text-xl font-bold text-[#16324F]">All players</h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#0460A9]/10 text-[#5D7EA1]">
                          <th className="px-4 py-3 text-left font-semibold">{t('leaderboard.rank')}</th>
                          <th className="px-4 py-3 text-left font-semibold">{t('leaderboard.player')}</th>
                          <th className="px-4 py-3 text-right font-semibold">{t('leaderboard.score')}</th>
                          <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">{t('leaderboard.correct')}</th>
                          <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">{t('leaderboard.streak')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedEntries.map((entry, index) => {
                          const isMe = entry.user_id === user?.uid;
                          return (
                            <tr
                              key={entry.user_id}
                              className={`border-b border-[#0460A9]/8 ${
                                isMe ? 'bg-[#0460A9]/6' : 'hover:bg-white/50'
                              }`}
                            >
                              <td className="px-4 py-3 font-semibold text-[#456786]">{index + 1}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <ProfileAvatar
                                    displayName={entry.user_display_name}
                                    photoURL={entry.user_photo_url}
                                    size={40}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-[#16324F]">
                                      {isMe ? 'You' : entry.user_display_name}
                                    </p>
                                    <p className="text-xs text-[#5D7EA1]">
                                      {entry.correct_count + entry.incorrect_count} answered
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-[#0460A9]">{entry.total_score}</td>
                              <td className="hidden px-4 py-3 text-right font-semibold text-[#0D8C6D] sm:table-cell">
                                {entry.correct_count}/{entry.correct_count + entry.incorrect_count}
                              </td>
                              <td className="hidden px-4 py-3 text-right font-semibold text-[#E67E22] sm:table-cell">
                                {entry.streak}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
