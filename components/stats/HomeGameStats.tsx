'use client';
import { useEffect, useState } from 'react';
import { summarizeGameStats } from '@/lib/stats/game';
import type { UserHistoryRow } from '@/lib/analytics/history';

export default function HomeGameStats({ uid, locale }: { uid: string; locale: 'en' | 'th' }) {
  const [result, setResult] = useState<{ uid: string; bestScore: number; bestStreak: number } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/users/${encodeURIComponent(uid)}/history`, { signal: abort.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('History unavailable'); return response.json() as Promise<UserHistoryRow[]>; })
      .then(history => { if (!abort.signal.aborted && Array.isArray(history)) { const stats = summarizeGameStats(history); setResult({ uid, bestScore: stats.bestScore, bestStreak: stats.bestStreak }); } })
      .catch(() => {});
    return () => abort.abort();
  }, [uid]);
  const stats = result?.uid === uid ? result : null;
  return <dl className="my-4 grid grid-cols-2 gap-3 text-white">
    <div className="rounded-2xl border border-white/15 bg-black/15 px-3 py-3"><dt className="text-xs text-white/80">{locale === 'th' ? 'ตอบถูกต่อเนื่องสูงสุด' : 'Longest correct streak'}</dt><dd className="mt-1 text-xl font-bold">{stats?.bestStreak ?? '—'} <span className="text-xs font-normal text-white/80">{locale === 'th' ? 'ข้อ' : 'answers'}</span></dd></div>
    <div className="rounded-2xl border border-white/15 bg-black/15 px-3 py-3"><dt className="text-xs text-white/80">{locale === 'th' ? 'คะแนนสูงสุด' : 'Best score'}</dt><dd className="mt-1 text-xl font-bold">{stats ? stats.bestScore.toLocaleString() : '—'} <span className="text-xs font-normal text-white/80">{locale === 'th' ? 'คะแนน' : 'points'}</span></dd></div>
  </dl>;
}
