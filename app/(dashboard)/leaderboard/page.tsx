'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import type { LeaderboardEntry, Quiz } from '@/lib/types';

function LeaderboardPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<Quiz[]>([]);
  const [selectedSession, setSelectedSession] = useState(searchParams.get('session') || '');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/questions/sessions').then(r => r.ok ? r.json() : []).then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    fetch(`/api/play/${selectedSession}/leaderboard`).then(r => r.ok ? r.json() : []).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [selectedSession]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const myEntry = entries.find(e => e.user_id === user?.uid);
  const myRank = entries.findIndex(e => e.user_id === user?.uid) + 1;

  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumHeights = ['h-24', 'h-32', 'h-20'];
  const podiumColors = ['from-gray-400 to-gray-300', 'from-amber-400 to-yellow-300', 'from-amber-700 to-amber-600'];
  const medals = ['🥈', '🥇', '🥉'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-white">{t('leaderboard.title')}</h1>

      <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none">
        <option value="" className="bg-gray-900">{t('leaderboard.select_session')}</option>
        {sessions.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>)}
      </select>

      {!selectedSession ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
          <p className="text-gray-400">Select a quiz session to view the leaderboard</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-10 text-center">
          <p className="text-gray-400">No entries yet for this session</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length >= 1 && (
            <div className="flex items-end justify-center gap-4 pt-8 pb-4">
              {podiumOrder.map((entry, idx) => entry && (
                <motion.div key={entry.user_id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.2 }}
                  className="flex flex-col items-center">
                  <span className="text-3xl mb-2">{medals[idx]}</span>
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg mb-2 border-2 border-white/20">
                    {entry.user_display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">{entry.user_display_name}</p>
                  <p className="text-indigo-400 font-bold">{entry.total_score}</p>
                  <div className={`${podiumHeights[idx]} w-24 rounded-t-xl bg-gradient-to-t ${podiumColors[idx]} mt-2 flex items-start justify-center pt-2`}>
                    <span className="text-white/80 font-bold">{idx === 1 ? '1' : idx === 0 ? '2' : '3'}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Your result */}
          {myEntry && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-indigo-400">#{myRank}</span>
                <span className="text-white font-semibold">{t('leaderboard.your_result')}</span>
              </div>
              <span className="text-xl font-bold text-white">{myEntry.total_score} pts</span>
            </div>
          )}

          {/* Full table */}
          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-3 px-4">{t('leaderboard.rank')}</th>
                <th className="text-left py-3 px-4">{t('leaderboard.player')}</th>
                <th className="text-right py-3 px-4">{t('leaderboard.score')}</th>
                <th className="text-right py-3 px-4 hidden sm:table-cell">{t('leaderboard.correct')}</th>
                <th className="text-right py-3 px-4 hidden sm:table-cell">{t('leaderboard.streak')}</th>
              </tr></thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.user_id} className={`border-b border-white/5 ${entry.user_id === user?.uid ? 'bg-indigo-500/5' : ''}`}>
                    <td className="py-3 px-4 text-gray-400 font-medium">{idx + 1}</td>
                    <td className="py-3 px-4 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {entry.user_display_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-white">{entry.user_display_name}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-white font-semibold">{entry.total_score}</td>
                    <td className="py-3 px-4 text-right text-emerald-400 hidden sm:table-cell">{entry.correct_count}/{entry.correct_count + entry.incorrect_count}</td>
                    <td className="py-3 px-4 text-right text-orange-400 hidden sm:table-cell">🔥 {entry.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
