'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { UserHistoryRow } from '@/lib/analytics/history';
import { usePersonalRecapReport } from '@/lib/hooks/usePersonalRecapReport';
import PersonalRecapCard from './PersonalRecapCard';
import { createRequestFreshness } from '@/lib/client/request-freshness';

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
    const freshness = createRequestFreshness();
    async function load() {
      if (abort.signal.aborted || !freshness.start()) return;
      let success = false;
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(uid!)}/history`, { signal: abort.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('History unavailable');
        const rows: UserHistoryRow[] = await response.json();
        const latest = rows[0];
        if (!abort.signal.aborted) {
          success = true;
          setResult({ key, sessionId: latest?.session_id ?? null, error: false });
        }
      } catch {
        if (!abort.signal.aborted) setResult({ key, sessionId: null, error: true });
      } finally { freshness.finish(success); }
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
    <p className="history-section-label">{copy('Quiz summary', 'สรุปผลแบบทดสอบ')}</p>
    <h2 id="home-recap-title">{loading ? copy('Loading summary…', 'กำลังเตรียมสรุปผลแบบทดสอบ…') : error ? copy('Your recap couldn’t load', 'ยังโหลดสรุปของคุณไม่ได้') : !uid ? copy('Sign in to see your results', 'เข้าสู่ระบบเพื่อดูผลแบบทดสอบ') : copy('No quiz results yet', 'ยังไม่มีผลแบบทดสอบ')}</h2>
    <p className="history-recap-body" role={loading ? 'status' : undefined}>{loading ? copy('Finding your latest completed quiz.', 'กำลังค้นหาแบบทดสอบล่าสุดที่คุณทำเสร็จ') : error ? copy('Please try again to see your latest quiz recap.', 'ลองอีกครั้งเพื่อดูสรุปจากแบบทดสอบล่าสุด') : !uid ? copy('Your quiz results are saved to your account.', 'ดูผลแบบทดสอบที่บันทึกไว้ในบัญชีของคุณ') : copy('Complete a quiz to see your summary here.', 'ทำแบบทดสอบให้เสร็จเพื่อดูสรุปที่นี่')}</p>
    {error ? <button type="button" className="personal-recap-details" onClick={() => setVersion((v) => v + 1)}>{copy('Try again', 'ลองอีกครั้ง')} →</button> : !loading && <Link className="personal-recap-details" href={uid ? '/quizzes' : '/sign-in?next=%2F'}>{uid ? copy('Choose a quiz', 'เลือกแบบทดสอบสุขภาพ') : copy('Sign in', 'เข้าสู่ระบบ')} →</Link>}
  </section>;
}
