'use client';

import Link from 'next/link';
import { historyCoaching, isEverydayInsight } from '@/lib/analytics/history-coaching';
import type { PersonalHistoryReport } from '@/lib/analytics/history';
import { firstInsightSentence } from '@/lib/analytics/insight-preview';
import './personal-recap.css';

function RecapIcon({ name, className = '' }: { name: 'book' | 'spark' | 'check'; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'book' ? <path d="M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V5ZM12 7v15M6 9h3M15 9h3M6 13h3M15 13h3" /> : name === 'spark' ? <path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z" /> : <path d="m5 12 4 4L19 6" />}
  </svg>;
}

/** Shared presentation and wording for the same completed-quiz recap on Home and Stats. */
export default function PersonalRecapCard({ report, locale, compact = false, detailsHref, headingId = 'recap-title' }: {
  report: PersonalHistoryReport;
  locale: 'en' | 'th';
  compact?: boolean;
  detailsHref?: string;
  headingId?: string;
}) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const coaching = historyCoaching(report, locale);
  const feedback = report.feedback;
  const everydayFeedback = feedback && feedback.reviewStatus !== 'metrics' && isEverydayInsight(feedback) ? feedback : null;
  const generating = report.insightState === 'generating';
  const stateText = generating
    ? copy('AI is analysing your quiz answers…', 'AI กำลังวิเคราะห์คำตอบของคุณ…')
    : report.insightState === 'rejected'
      ? copy('The AI recap was removed after review. Your recorded quiz answers are still available.', 'สรุปจาก AI ถูกนำออกหลังการตรวจทาน คุณยังดูคำตอบในแบบทดสอบของคุณได้')
      : report.insightState === 'consent-required'
        ? copy('Accept the current privacy notice to enable AI analysis. This recap uses your recorded answers.', 'ยอมรับประกาศความเป็นส่วนตัวฉบับปัจจุบันเพื่อใช้ AI วิเคราะห์ สรุปนี้อ้างอิงจากคำตอบของคุณ')
        : !everydayFeedback ? copy('AI recap is unavailable. Here is a recap from your recorded answers.', 'ยังไม่มีสรุปจาก AI นี่คือสรุปจากคำตอบที่คุณเลือก') : null;
  return <section className={`nq-personal-recap history-card history-recap${compact ? ' personal-recap-compact' : ''}`} aria-labelledby={headingId}>
    <div className="history-recap-art" aria-hidden="true"><div className="history-bloom bloom-one" /><div className="history-bloom bloom-two" /><div className="history-bloom bloom-three" /><div className="history-art-center"><RecapIcon name="book" /></div><RecapIcon name="spark" className="history-art-spark" /></div>
    <div className="history-recap-copy">
      <p className="history-section-label"><RecapIcon name="spark" />{copy('Your personal recap', 'สรุปสำหรับคุณ')}</p>
      {everydayFeedback?.reviewStatus === 'approved' && <span className="personal-recap-review-badge personal-recap-approved">{copy('AI · admin reviewed', 'AI · ผ่านการตรวจสอบจากผู้ดูแลแล้ว')}</span>}
      {everydayFeedback?.reviewStatus === 'provisional' && <span className="personal-recap-review-badge">{copy('AI · awaiting admin or doctor review', 'AI · ยังไม่ผ่านการตรวจสอบจากผู้ดูแลหรือแพทย์')}</span>}
      <h2 id={headingId}>{everydayFeedback?.headline ?? coaching.headline}</h2>
      {stateText && <p className="personal-recap-status" role="status">{stateText}</p>}
      {everydayFeedback && <p className="history-recap-body">{firstInsightSentence(everydayFeedback.body, locale)}</p>}
      {!compact && <>
      {coaching.total > 0 && <div className="history-recap-facts">
          <span><RecapIcon name="check" />{copy(`${coaching.correct} ${coaching.correct === 1 ? 'answer' : 'answers'} to build on`, `มี ${coaching.correct} คำตอบให้เรียนรู้ต่อ`)}</span>
          {coaching.review.length > 0 && <span className="history-fact-review"><RecapIcon name="book" />{copy(`${coaching.review.length} to revisit`, `อีก ${coaching.review.length} ข้อที่ควรทบทวน`)}</span>}
        </div>}
      </>}
      {detailsHref && <>
        <Link className="personal-recap-details" href={detailsHref}>{copy('View full feedback', 'ดูคำแนะนำทั้งหมด')} <span aria-hidden="true">→</span></Link>
        <p className="personal-recap-note">{copy('A recap of your learning, not medical advice.', 'สรุปสิ่งที่คุณเรียนรู้ ไม่ใช่คำแนะนำทางการแพทย์')}</p>
      </>}
    </div>
  </section>;
}
