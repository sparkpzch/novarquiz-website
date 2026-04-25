'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import type { LeaderboardEntry, Session } from '@/lib/types';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { watchScores, type PlayerScore } from '@/lib/firebase/rtdb';

function LeaderboardPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState(searchParams.get('session') || '');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(searchParams.get('session')));
  const [liveScores, setLiveScores] = useState<Record<string, PlayerScore>>({});

  useEffect(() => {
    fetch('/api/sessions')
      .then((response) => (response.ok ? response.json() : []))
      .then(setSessions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    fetch(`/api/play/${selectedSession}/leaderboard`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedSession) {
      setLiveScores({});
      return;
    }
    return watchScores(selectedSession, setLiveScores);
  }, [selectedSession]);

  const dbUserIds = new Set(entries.map((e) => e.user_id));
  const mergedEntries: LeaderboardEntry[] = [
    ...entries.map((entry) => {
      const live = liveScores[entry.user_id];
      return live ? { ...entry, total_score: live.score } : entry;
    }),
    ...Object.entries(liveScores)
      .filter(([uid]) => !dbUserIds.has(uid))
      .map(([uid, live]): LeaderboardEntry => ({
        id: uid,
        session_id: selectedSession,
        user_id: uid,
        user_display_name: live.displayName,
        user_photo_url: live.photoURL ?? null,
        total_score: live.score,
        correct_count: 0,
        incorrect_count: 0,
        unanswered_count: 0,
        streak: 0,
        total_time_ms: 0,
        completed_at: '',
      })),
  ];

  const sortedEntries = [...mergedEntries].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (a.total_time_ms !== b.total_time_ms) return a.total_time_ms - b.total_time_ms;
    return a.user_display_name.localeCompare(b.user_display_name);
  });
  const myEntry = sortedEntries.find((entry) => entry.user_id === user?.uid);
  const myRank = sortedEntries.findIndex((entry) => entry.user_id === user?.uid) + 1;
  const topThree = sortedEntries.slice(0, 3);
  const selectedSessionMeta = sessions.find((session) => session.id === selectedSession);
  const podium =
    topThree.length === 1
      ? [{ entry: topThree[0], rank: 1, height: 'h-36', featured: true }]
      : topThree.length === 2
        ? [
            { entry: topThree[0], rank: 1, height: 'h-36', featured: true },
            { entry: topThree[1], rank: 2, height: 'h-28', featured: false },
          ]
        : [
            { entry: topThree[1], rank: 2, height: 'h-28', featured: false },
            { entry: topThree[0], rank: 1, height: 'h-36', featured: true },
            { entry: topThree[2], rank: 3, height: 'h-24', featured: false },
          ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="nq-card rounded-[34px] p-6 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Leaderboard</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F]">{t('leaderboard.title')}</h1>
            <p className="mt-2 text-sm text-[#5D7EA1]">Browse any finished session and compare scores across all players.</p>
          </div>

          <div className="w-full md:max-w-sm">
                <label className="mb-2 block text-sm font-semibold text-[#16324F]">{t('leaderboard.select_session')}</label>
            <select
              value={selectedSession}
              onChange={(event) => {
                const nextSession = event.target.value;
                setLoading(Boolean(nextSession));
                setSelectedSession(nextSession);
                router.replace(nextSession ? `/leaderboard?session=${nextSession}` : '/leaderboard');
              }}
              className="w-full rounded-[24px] border border-[#0460A9]/12 bg-white px-4 py-3 text-[#16324F] outline-none"
            >
              <option value="">{t('leaderboard.select_session')}</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} ({new Date(session.started_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!selectedSession ? (
        <div className="nq-card rounded-[34px] p-10 text-center">
          <p className="text-lg font-semibold text-[#16324F]">Select a quiz session to view the leaderboard.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-14">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
        </div>
      ) : mergedEntries.length === 0 ? (
        <div className="nq-card rounded-[34px] p-10 text-center">
          <p className="text-lg font-semibold text-[#16324F]">No entries yet for this session.</p>
        </div>
      ) : (
        <>
          <section className="nq-card rounded-[34px] p-6 md:p-8">
            {selectedSessionMeta && (
              <div className="mb-6 border-b border-[#0460A9]/10 pb-4">
                <h2 className="text-2xl font-bold text-[#16324F]">{selectedSessionMeta.name}</h2>
                <p className="mt-2 text-sm text-[#5D7EA1]">
                  {selectedSessionMeta.description || 'Browse the finished standings for this session.'}
                </p>
              </div>
            )}
            <div className="flex items-end justify-center gap-4">
              {podium.map(({ entry, rank, height, featured }, index) => {
                return (
                  <motion.div
                    key={entry.user_id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className="flex w-24 flex-col items-center"
                  >
                    <ProfileAvatar
                      displayName={entry.user_display_name}
                      photoURL={entry.user_photo_url}
                      size={featured ? 72 : 60}
                      ringClassName="ring-4 ring-[#DDF0FF] shadow-[0_16px_28px_rgba(17,87,145,0.14)]"
                    />
                    <div className="mt-3 w-full text-center">
                      <p className="truncate text-sm font-bold text-[#16324F]">{entry.user_display_name}</p>
                      <p className="text-lg text-[#0460A9]">{entry.total_score} pts</p>
                    </div>
                    <div className={`mt-4 flex w-24 items-start justify-center rounded-t-[26px] bg-gradient-to-b from-[#DDF0FF] to-[#8EC0FF] pt-3 text-2xl font-bold text-[#16324F] ${height}`}>
                      {rank}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {myEntry && (
            <section className="rounded-[28px] bg-[#C9F258] px-5 py-4 text-[#16324F] shadow-[0_18px_34px_rgba(17,87,145,0.12)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold">#{myRank}</span>
                  <ProfileAvatar displayName={myEntry.user_display_name} photoURL={myEntry.user_photo_url} size={42} />
                  <span className="text-lg font-semibold">{t('leaderboard.your_result')}</span>
                </div>
                <span className="text-lg font-semibold">{myEntry.total_score} pts</span>
              </div>
            </section>
          )}

          <section className="rounded-[34px] bg-[#EEF6E4]/80 p-4 md:p-5">
            <div className="space-y-3">
              {sortedEntries.slice(3).map((entry, index) => {
                const rank = index + 4;
                const isMe = entry.user_id === user?.uid;
                return (
                  <div
                    key={entry.user_id}
                    className={`flex items-center gap-4 rounded-[22px] px-4 py-3 ${isMe ? 'bg-[#C9F258] text-[#16324F]' : 'bg-white text-[#16324F]'}`}
                  >
                    <span className="w-6 text-center text-lg font-semibold">{rank}</span>
                    <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{isMe ? 'You' : entry.user_display_name}</p>
                      <p className="text-sm text-[#5D7EA1]">
                        {entry.correct_count}/{entry.correct_count + entry.incorrect_count} correct · 🔥 {entry.streak}
                      </p>
                    </div>
                    <span className="text-lg font-semibold">{entry.total_score} pts</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <LeaderboardPageContent />
    </Suspense>
  );
}
