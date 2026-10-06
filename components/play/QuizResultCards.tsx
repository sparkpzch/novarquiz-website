'use client';

import { useState } from 'react';
import { formatQuizTime } from '@/lib/analytics/leaderboard';
import { firstInsightSentence } from '@/lib/analytics/insight-preview';
import { usePersonalRecapReport } from '@/lib/hooks/usePersonalRecapReport';
import { TrophyIcon } from './LeaderboardStandings';
import styles from './quiz.module.css';

export function ResultScoreCard({ score, elapsedMs, rank, saving = false, th, headingLevel = 1 }: {
  score: number; elapsedMs: number; rank: number | null; saving?: boolean; th: boolean; headingLevel?: 1 | 2;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  return <section className={`${styles.surface} ${styles.scorePanel}`} aria-labelledby="finished-title">
    <div className={styles.resultHeading}><div><span className={styles.eyebrow}>{copy('YOUR RESULT', 'ผลของคุณ')}</span><Heading id="finished-title">{copy('Quiz complete', 'ทำแบบทดสอบเสร็จแล้ว')}</Heading></div><div className={styles.trophy}><TrophyIcon /></div></div>
    <div className={styles.resultStats}>
      <div className={styles.resultStat}><strong>{score}</strong><small>{copy('Points', 'คะแนน')}</small></div>
      <div className={styles.resultStat}><strong>{rank ? `#${rank}` : '—'}</strong><small>{copy('Your rank', 'อันดับของคุณ')}</small></div>
      <div className={styles.resultStat}><strong>{formatQuizTime(elapsedMs)}</strong><small>{copy('Time', 'เวลาที่ใช้')}</small></div>
    </div>
    {saving && <p className={styles.resultStatus} role="status">{copy('Saving your result…', 'กำลังบันทึกผล…')}</p>}
  </section>;
}

export function ResultInsightCard({ uid, sessionId, saving = false, guest = false, th, onSummary }: {
  uid: string | null; sessionId: string; saving?: boolean; guest?: boolean; th: boolean; onSummary: () => void;
}) {
  const [retry, setRetry] = useState(0);
  const locale = th ? 'th' : 'en';
  const copy = (en: string, thai: string) => th ? thai : en;
  const result = usePersonalRecapReport(!saving && !guest ? uid : null, !saving && !guest ? sessionId : null, locale, retry);
  const feedback = result?.data?.feedback;
  const insight = feedback && feedback.reviewStatus !== 'metrics' ? feedback : null;
  const state = result?.data?.insightState;
  const status = guest ? copy('Sign in to save your results.', 'เข้าสู่ระบบเพื่อเก็บคำตอบและรับสรุปผลแบบทดสอบ')
    : saving ? copy('Your summary will load after your result is saved.', 'สรุปจะเริ่มทันทีที่บันทึกผลแล้ว')
      : result?.error ? copy('Could not load your recap.', 'โหลดสรุปไม่สำเร็จ')
        : !result || state === 'generating' ? copy('AI is analysing your answers…', 'AI กำลังวิเคราะห์คำตอบของคุณ…')
          : state === 'rejected' ? copy('A new AI recap is being prepared.', 'กำลังเตรียมสรุป AI ใหม่')
            : state === 'consent-required' ? copy('Accept the privacy notice to enable AI analysis.', 'ยอมรับประกาศความเป็นส่วนตัวเพื่อใช้ AI วิเคราะห์')
              : copy('AI recap is unavailable. You can still review your answers.', 'ยังไม่มีสรุปจาก AI คุณยังทบทวนคำตอบได้');
  return <section className={`${styles.surface} ${styles.insightPanel}`} aria-labelledby="result-insight-title">
    <div className={styles.insightHeading}><span className={styles.summaryIcon} aria-hidden="true">✧</span><h2 id="result-insight-title">{insight?.reviewStatus === 'standard' ? copy('Quiz summary', 'สรุปผลแบบทดสอบ') : copy('AI Summary', 'สรุปจาก AI')}</h2></div>
    {insight ? <><h3>{insight.headline}</h3><p className={styles.insightSentence}>{firstInsightSentence(insight.body, locale)}{' '}{insight.reviewStatus !== 'standard' && <span className={`${styles.reviewBadge} ${insight.reviewStatus === 'approved' ? styles.reviewed : ''}`}>{insight.reviewStatus === 'approved' ? copy('Admin reviewed', 'ผ่านการตรวจสอบแล้ว') : copy('Not yet reviewed', 'ยังไม่ผ่านการตรวจสอบ')}</span>}</p></>
      : <p className={styles.resultStatus} role="status">{!guest && !saving && (!result || state === 'generating') && <span className={styles.spinner} />}{status}</p>}
    <div className={styles.insightActions}>{result?.error && <button type="button" className={styles.secondaryButton} onClick={() => setRetry(value => value + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button>}<button type="button" className={styles.textButton} disabled={saving} onClick={onSummary}>{guest ? copy('Sign in', 'เข้าสู่ระบบ') : copy('Review my answers', 'ทบทวนคำตอบของฉัน')} <span aria-hidden="true">→</span></button></div>
  </section>;
}
