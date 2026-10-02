'use client';

import { useEffect, useRef, useState } from 'react';
import { firstInsightSentence } from '@/lib/analytics/insight-preview';
import type { PlayerInsightReport } from '@/lib/analytics/player-insight';
import AnswerGraphDialog from './AnswerGraphDialog';
import styles from './player-insight.module.css';

export default function PlayerInsightPanel({ sessionId, player, th }: {
  sessionId: string; player: { id: string; displayName: string } | null; th: boolean;
}) {
  const [result, setResult] = useState<{ key: string; report?: PlayerInsightReport; error?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [graphOpen, setGraphOpen] = useState(false);
  const cache = useRef(new Map<string, { report: PlayerInsightReport; at: number }>());
  const locale = th ? 'th' : 'en';
  const playerId = player?.id;
  const key = `${sessionId}:${playerId}:${locale}:${retry}`;
  const copy = (en: string, thai: string) => th ? thai : en;
  useEffect(() => {
    if (!playerId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const started = Date.now();
    const load = async () => {
      if (controller.signal.aborted || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const response = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/insights?uid=${encodeURIComponent(playerId)}&locale=${locale}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Summary unavailable');
        const report: PlayerInsightReport = await response.json();
        if (controller.signal.aborted) return;
        cache.current.set(key, { report, at: Date.now() });
        setResult({ key, report });
        if (report.state === 'generating' && Date.now() - started < 120_000) timer = setTimeout(load, 5_000);
        else if (report.state === 'pending' || report.state === 'approved') timer = setTimeout(load, 30_000);
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      } finally { inFlight = false; }
    };
    const saved = cache.current.get(key);
    if (saved && Date.now() - saved.at < 30_000 && saved.report.state !== 'generating') {
      void Promise.resolve().then(() => { if (!controller.signal.aborted) setResult({ key, report: saved.report }); });
      timer = setTimeout(load, 30_000 - (Date.now() - saved.at));
    } else void load();
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [sessionId, playerId, locale, key]);
  const active = result?.key === key ? result : null;
  const report = active?.report;
  const summary = report?.summary;
  return <section className={styles.panel} aria-label={copy('Personal AI summary', 'สรุปจาก AI รายบุคคล')}>
    <div className={styles.header}>
      <div><p className={styles.eyebrow}>✧ {copy('AI SUMMARY', 'สรุปจาก AI')}</p><h2>{player?.displayName ?? copy('Personal summaries', 'สรุปสำหรับแต่ละคน')}</h2></div>
      {summary && <button type="button" className={styles.graphButton} onClick={() => setGraphOpen(true)}>{copy('Answer graph', 'กราฟคำตอบ')} <span aria-hidden="true">↗</span></button>}
    </div>
    {!player ? <p className={styles.muted}>{copy('Choose a player from the leaderboard to see their summary and the choices behind it.', 'เลือกผู้เล่นจากอันดับเพื่อดูสรุปและคำตอบที่ใช้สร้างสรุปของแต่ละคน')}</p>
      : active?.error ? <div role="alert"><p>{copy('Could not load this player’s summary.', 'โหลดสรุปของผู้เล่นไม่สำเร็จ')}</p><button type="button" className={styles.graphButton} onClick={() => setRetry(value => value + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>
        : !report || report.state === 'generating' ? <p className={styles.muted} role="status">{copy('Loading this player’s AI summary…', 'กำลังโหลดสรุปจาก AI ของผู้เล่น…')}</p>
          : summary ? <><h3>{summary.headline}</h3><p className={styles.body}>{firstInsightSentence(summary.body, report.locale)}</p><span className={`${styles.badge} ${report.state === 'approved' ? styles.approved : ''}`}>{report.state === 'approved' ? copy('Admin reviewed', 'ผ่านการตรวจสอบแล้ว') : copy('Not yet reviewed', 'ยังไม่ผ่านการตรวจสอบ')}</span></>
            : <p className={styles.muted}>{report.state === 'rejected' ? copy('This summary is hidden after review.', 'สรุปนี้ถูกซ่อนหลังการตรวจสอบ') : copy('No saved AI summary for this completed run yet.', 'ยังไม่มีสรุปจาก AI ที่บันทึกไว้สำหรับการเล่นครั้งนี้')}</p>}
    {graphOpen && player && report?.summary && <AnswerGraphDialog key={key} report={report} playerName={player.displayName} th={th} onClose={() => setGraphOpen(false)} />}
  </section>;
}
