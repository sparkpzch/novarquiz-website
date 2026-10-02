'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { UserHistoryRow } from '@/lib/analytics/history';
import { usePersonalRecapReport } from '@/lib/hooks/usePersonalRecapReport';
import PersonalRecapCard from './PersonalRecapCard';

export default function LatestPersonalRecap({ uid, locale }: { uid: string | null; locale: 'en' | 'th' }) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const [version, setVersion] = useState(0);
  const key = `${uid}:${locale}:${version}`;
  const [result, setResult] = useState<{ key: string; sessionId: string | null; error: boolean } | null>(null);
  const current = result?.key === key ? result : null;
  const detail = usePersonalRecapReport(uid, current?.sessionId ?? null, locale, version);

  useEffect(() => {
    if (!uid) return;
    const abort = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || abort.signal.aborted) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(uid!)}/history`, { signal: abort.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('History unavailable');
        const rows: UserHistoryRow[] = await response.json();
        const latest = rows[0];
        if (!abort.signal.aborted) setResult({ key, sessionId: latest?.session_id ?? null, error: false });
      } catch {
        if (!abort.signal.aborted) setResult({ key, sessionId: null, error: true });
      } finally { inFlight = false; }
    }
    const resume = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      abort.abort();
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [uid, locale, key]);

  if (detail?.data) return <PersonalRecapCard report={detail.data} locale={locale} compact headingId="home-recap-title" detailsHref={`/stats?session=${encodeURIComponent(detail.data.session.session_id)}`} />;

  const error = current?.error || detail?.error;
  const loading = !!uid && (!current || (!!current.sessionId && !detail));
  return <section className="nq-personal-recap personal-recap-placeholder" aria-labelledby="home-recap-title" aria-busy={loading}>
    <p className="history-section-label">✦ {copy('Your personal recap', 'สรุปสำหรับคุณ')}</p>
    <h2 id="home-recap-title">{loading ? copy('Putting your recap together…', 'กำลังเตรียมสรุปสำหรับคุณ…') : error ? copy('Your recap couldn’t load', 'ยังโหลดสรุปของคุณไม่ได้') : !uid ? copy('Make your learning personal', 'เรียนรู้ในแบบของคุณ') : copy('A little learning starts here', 'เริ่มเรียนรู้วันละนิดที่นี่')}</h2>
    <p className="history-recap-body" role={loading ? 'status' : undefined}>{loading ? copy('Finding your latest completed quiz.', 'กำลังค้นหาแบบทดสอบล่าสุดที่คุณทำเสร็จ') : error ? copy('Please try again to see your latest quiz recap.', 'ลองอีกครั้งเพื่อดูสรุปจากแบบทดสอบล่าสุด') : !uid ? copy('Sign in to see what you learned and what to explore next.', 'เข้าสู่ระบบเพื่อดูสิ่งที่คุณเรียนรู้และเรื่องที่น่าทำความเข้าใจต่อ') : copy('Complete a health quiz for a simple recap and a next step just for you.', 'ทำแบบทดสอบสุขภาพ แล้วมาดูสรุปและคำแนะนำสำหรับคุณ')}</p>
    {error ? <button type="button" className="personal-recap-details" onClick={() => setVersion((v) => v + 1)}>{copy('Try again', 'ลองอีกครั้ง')} →</button> : !loading && <Link className="personal-recap-details" href={uid ? '/quizzes' : '/sign-in?next=%2F'}>{uid ? copy('Explore health quizzes', 'เลือกแบบทดสอบสุขภาพ') : copy('Sign in', 'เข้าสู่ระบบ')} →</Link>}
  </section>;
}
