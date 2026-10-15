'use client';
import type { CSSProperties } from 'react';
import type { LscvdSummary } from '@/lib/analytics/lscvd';
import { formatMetric, isSuppressed, type Metric } from '@/lib/analytics/lscvd-metrics';
import { PROVINCES, REGION_LABELS } from '@/lib/onboarding/provinces';
import styles from './province-map.module.css';

const RISKS: Array<[keyof NonNullable<LscvdSummary['prevalence']>, string, string]> = [
  ['smoking', 'Smoking', 'สูบบุหรี่'], ['hypertension', 'High blood pressure', 'ความดันโลหิตสูง'], ['diabetes', 'Diabetes', 'เบาหวาน'],
  ['highCholesterol', 'High cholesterol', 'ไขมันในเลือดสูง'], ['overweight', 'BMI 25 or above', 'BMI ตั้งแต่ 25'],
  ['centralObesity', 'Central obesity', 'อ้วนลงพุง'], ['familyHistory', 'Family history', 'ประวัติครอบครัว'],
];

export default function ProvinceCard({ code, summary, national, metric, minCell, th, style, interactive, onOpen }: {
  code: string; summary: LscvdSummary; national: LscvdSummary; metric: Metric; minCell: number; th: boolean;
  style?: CSSProperties; interactive: boolean; onOpen: () => void;
}) {
  const copy = (en: string, thai: string) => (th ? thai : en);
  const province = PROVINCES.find(p => p.code === code)!;
  const region = REGION_LABELS.find(r => r.region === province.region)!;
  const topRisks = summary.prevalence
    ? RISKS.map(([key, en, thai]) => ({ label: th ? thai : en, pct: summary.prevalence![key].pct })).filter(r => r.pct !== null).sort((a, b) => b.pct! - a.pct!).slice(0, 3)
    : [];
  return <div className={styles.card} style={style} data-interactive={interactive || undefined} role="dialog" aria-label={th ? province.th : province.en}>
    <header>
      <h3>{th ? province.th : province.en}</h3>
      <p>{th ? province.en : province.th} · {th ? region.th : region.en}</p>
    </header>
    <dl>
      <dt>{copy('Participants', 'ผู้เข้าร่วม')}</dt><dd>{summary.participants.toLocaleString()}</dd>
      <dt>{copy('Shared health answers', 'ตอบข้อมูลสุขภาพ')}</dt><dd>{summary.healthResponders.toLocaleString()}</dd>
      {metric.key !== 'participants' && <><dt>{th ? metric.th : metric.en}</dt><dd>{formatMetric(metric, summary, th)}{!isSuppressed(metric, summary) && <small>{copy('Thailand', 'ทั้งประเทศ')} {formatMetric(metric, national, th)}</small>}</dd></>}
      {!summary.suppressed && summary.knowledgeScore !== null && metric.key !== 'lowKnowledge' && <><dt>{copy('Knowledge score', 'คะแนนความรู้')}</dt><dd>{summary.knowledgeScore}%{national.knowledgeScore !== null && <small>{copy('Thailand', 'ทั้งประเทศ')} {national.knowledgeScore}%</small>}</dd></>}
      {summary.screened?.pct != null && <><dt>{copy('Lipid test in 5 years', 'ตรวจไขมันภายใน 5 ปี')}</dt><dd>{summary.screened.pct}%</dd></>}
    </dl>
    {topRisks.length > 0 && <><h4>{copy('Most common risk factors', 'ปัจจัยเสี่ยงที่พบมาก')}</h4><ol>{topRisks.map(r => <li key={r.label}><span>{r.label}</span><strong>{r.pct}%</strong></li>)}</ol></>}
    {(summary.suppressed || summary.healthSuppressed) && <p className={styles.note}>{summary.participants === 0 && summary.healthResponders === 0
      ? copy('No participants from this province yet.', 'ยังไม่มีผู้เข้าร่วมจากจังหวัดนี้')
      : summary.suppressed && summary.healthSuppressed
      ? copy(`Figures appear once at least ${minCell} people consent.`, `จะแสดงตัวเลขเมื่อมีผู้ยินยอมอย่างน้อย ${minCell} คน`)
      : summary.healthSuppressed
        ? copy(`Health figures appear once at least ${minCell} people share health answers.`, `ข้อมูลสุขภาพจะแสดงเมื่อมีผู้ตอบอย่างน้อย ${minCell} คน`)
        : copy(`Knowledge figures appear once at least ${minCell} people consent.`, `คะแนนความรู้จะแสดงเมื่อมีผู้ยินยอมอย่างน้อย ${minCell} คน`)}</p>}
    {interactive
      ? <button type="button" className={`${styles.button} ${styles.cardAction}`} onClick={onOpen}>{copy('View details', 'ดูรายละเอียด')}</button>
      : <p className={styles.hint}>{copy('Click the province for details', 'คลิกที่จังหวัดเพื่อดูรายละเอียด')}</p>}
  </div>;
}
