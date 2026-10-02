'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import type { LeaderboardEntry, Session } from '@/lib/types';
import LeaderboardStandings from '@/components/play/LeaderboardStandings';
import styles from '@/components/play/quiz.module.css';

function LeaderboardPageContent() {
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSession = searchParams.get('session') || '';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsError, setSessionsError] = useState(false);
  const [result, setResult] = useState<{ sessionId: string; entries: LeaderboardEntry[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;
    const controller = new AbortController();
    fetch('/api/sessions', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sessions unavailable');
        return response.json();
      })
      .then((data: Session[]) => { setSessions(data); setSessionsError(false); })
      .catch(() => { if (!controller.signal.aborted) setSessionsError(true); });
    return () => controller.abort();
  }, [authLoading, retry, user]);

  useEffect(() => {
    if (!selectedSession || authLoading || !user) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/play/${encodeURIComponent(selectedSession)}/leaderboard`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const entries: LeaderboardEntry[] = await response.json();
        if (!controller.signal.aborted) setResult({ sessionId: selectedSession, entries, error: false });
      } catch {
        if (!controller.signal.aborted) setResult((previous) => ({ sessionId: selectedSession, entries: previous?.sessionId === selectedSession ? previous.entries : [], error: true }));
      }
    };
    void load();
    // Completed database results contain public IDs. Keep them authoritative;
    // raw live scores also include unfinished players and cannot be merged here.
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [authLoading, retry, selectedSession, user]);

  const selectedSessionMeta = sessions.find((session) => session.id === selectedSession);
  const current = result?.sessionId === selectedSession ? result : null;
  const loading = selectedSession && !current;
  return <div className={styles.dashboard}>
    <section className={styles.surface}>
      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>NOVARQUIZ · LEADERBOARD</span><h1>{copy('Leaderboard', 'อันดับผู้เล่น')}</h1><p>{copy('Explore completed quiz results. Scores refresh as more players finish.', 'ดูผลแบบทดสอบที่ทำเสร็จแล้ว อันดับจะอัปเดตเมื่อมีผู้เล่นทำเสร็จเพิ่ม')}</p></div>
        <div className={styles.sessionControl}><label htmlFor="leaderboard-session">{copy('Quiz session', 'เลือกแบบทดสอบ')}</label><select id="leaderboard-session" className={styles.sessionSelect} value={selectedSession} onChange={(event) => router.replace(event.target.value ? `/leaderboard?session=${encodeURIComponent(event.target.value)}` : '/leaderboard')}>
          <option value="">{copy('Select a session', 'เลือกแบบทดสอบเพื่อดูอันดับ')}</option>
          {selectedSession && !selectedSessionMeta && <option value={selectedSession}>{copy('Current quiz session', 'แบบทดสอบปัจจุบัน')}</option>}
          {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {new Date(session.started_at).toLocaleDateString(th ? 'th-TH' : 'en-GB')}</option>)}
        </select></div>
      </div>
      {sessionsError && <div className={styles.error} role="alert">{copy('Could not load the session list.', 'โหลดรายการแบบทดสอบไม่สำเร็จ')} <button type="button" className={styles.secondaryButton} onClick={() => setRetry((value) => value + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>}
    </section>
    <section className={styles.surface} aria-busy={!!loading}>
      {!selectedSession ? <div className={styles.empty}><h3>{copy('Choose a quiz to see the rankings', 'เลือกแบบทดสอบเพื่อดูอันดับ')}</h3><p>{copy('Your result will be highlighted alongside other completed scores.', 'ผลของคุณจะมีป้ายกำกับเพื่อให้หาได้ง่าย')}</p></div> : loading ? <div className={styles.loading} role="status"><span className={styles.spinner} /><span>{copy('Loading completed results…', 'กำลังโหลดผลและอันดับ…')}</span></div> : <>
        {selectedSessionMeta && <div className={styles.boardSession}><h2>{selectedSessionMeta.name}</h2>{selectedSessionMeta.description && <p>{selectedSessionMeta.description}</p>}</div>}
        {current?.error && <div className={styles.error} role="alert">{copy('Could not refresh the rankings. Please try again.', 'อัปเดตอันดับไม่สำเร็จ กรุณาลองอีกครั้ง')} <button type="button" className={styles.secondaryButton} onClick={() => setRetry((value) => value + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>}
        {current && (!current.error || current.entries.length > 0) && <LeaderboardStandings key={selectedSession} entries={current.entries} th={th} />}
        <div className={styles.actions}>{current?.entries.some((entry) => entry.is_me) && <button type="button" className={styles.secondaryButton} onClick={() => router.push(`/stats?session=${encodeURIComponent(selectedSession)}`)}>{copy('View my answer summary', 'ดูสรุปจากคำตอบของฉัน')}</button>}<button type="button" className={styles.secondaryButton} onClick={() => router.push('/')}>{copy('Back to home', 'กลับหน้าหลัก')}</button></div>
      </>}
    </section>
  </div>;
}

export default function LeaderboardPage() {
  return <Suspense fallback={<div className={styles.surface}><div className={styles.loading} role="status"><span className={styles.spinner} />Loading…</div></div>}><LeaderboardPageContent /></Suspense>;
}
