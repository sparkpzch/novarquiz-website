// What the admin map can be coloured by. Every metric is oriented so that a
// higher value means "needs attention", which is what the most prominent map
// colour means in both themes.

import type { LscvdSummary, Rate } from './lscvd';

export type MetricKey = 'participants' | 'highRisk' | 'smoking' | 'hypertension' | 'diabetes' | 'highCholesterol' | 'overweight' | 'overdueScreening' | 'ldlNotAtTarget' | 'lowKnowledge';

export type Metric = {
  key: MetricKey;
  en: string; th: string;
  /** What the strongest colour means, shown next to the legend. */
  strongEn: string; strongTh: string;
  /** Uses health answers, so it follows the health suppression rule. */
  health: boolean;
  /** Value used for colouring; null when the province has no usable data. */
  value: (s: LscvdSummary) => number | null;
};

const pct = (r: Rate | null | undefined) => r?.pct ?? null;

export const METRICS: Metric[] = [
  { key: 'participants', en: 'Participants', th: 'จำนวนผู้ใช้งาน', strongEn: 'More participants', strongTh: 'ผู้ใช้เยอะ', health: false, value: s => (s.participants > 0 ? s.participants : null) },
  { key: 'highRisk', en: 'High risk (3+ risk factors)', th: 'ความเสี่ยงรวม (ปัจจัยเสี่ยง 3 ข้อขึ้นไป)', strongEn: 'Higher risk', strongTh: 'เสี่ยงมาก', health: true, value: s => pct(s.highRisk) },
  { key: 'smoking', en: 'Smoking', th: 'สูบบุหรี่', strongEn: 'More common', strongTh: 'ความชุกสูง', health: true, value: s => pct(s.prevalence?.smoking) },
  { key: 'hypertension', en: 'High blood pressure', th: 'ความดันโลหิตสูง', strongEn: 'More common', strongTh: 'ความชุกสูง', health: true, value: s => pct(s.prevalence?.hypertension) },
  { key: 'diabetes', en: 'Diabetes', th: 'เบาหวาน', strongEn: 'More common', strongTh: 'ความชุกสูง', health: true, value: s => pct(s.prevalence?.diabetes) },
  { key: 'highCholesterol', en: 'High cholesterol', th: 'ไขมันในเลือดสูง', strongEn: 'More common', strongTh: 'ความชุกสูง', health: true, value: s => pct(s.prevalence?.highCholesterol) },
  { key: 'overweight', en: 'BMI 25 or above', th: 'BMI ตั้งแต่ 25', strongEn: 'More common', strongTh: 'ความชุกสูง', health: true, value: s => pct(s.prevalence?.overweight) },
  { key: 'overdueScreening', en: 'Lipid test overdue or never', th: 'ไม่เคยตรวจไขมัน / ตรวจนานเกิน 5 ปี', strongEn: 'Screening needed', strongTh: 'ต้องเร่งคัดกรอง', health: true, value: s => pct(s.overdueScreening) },
  { key: 'ldlNotAtTarget', en: 'LDL above goal', th: 'LDL ไม่ถึงเป้า', strongEn: 'More above goal', strongTh: 'ไม่ถึงเป้ามาก', health: true, value: s => pct(s.ldlNotAtTarget) },
  { key: 'lowKnowledge', en: 'Low knowledge score', th: 'คะแนนความรู้ต่ำ', strongEn: 'Lower knowledge', strongTh: 'ความรู้ต่ำ', health: false, value: s => (s.knowledgeScore === null ? null : 100 - s.knowledgeScore) },
];
export const metricByKey = (key: string) => METRICS.find(m => m.key === key) ?? METRICS[0];

/** Whether a province's colour for this metric must be hidden. */
export const isSuppressed = (metric: Metric, s: LscvdSummary) => (metric.key === 'participants' ? false : metric.health ? s.healthSuppressed : s.suppressed);

/** Human value for a metric: counts for participants, the score itself for knowledge, else a percentage. */
export function formatMetric(metric: Metric, s: LscvdSummary, th: boolean) {
  if (metric.key === 'participants') return `${s.participants.toLocaleString()} ${th ? 'คน' : s.participants === 1 ? 'person' : 'people'}`;
  if (s.participants === 0 && s.healthResponders === 0) return th ? 'ไม่มีข้อมูล' : 'No data';
  if (isSuppressed(metric, s)) return th ? 'ข้อมูลไม่พอ' : 'Not enough data';
  if (metric.key === 'lowKnowledge') return s.knowledgeScore === null ? '–' : `${th ? 'คะแนน' : 'Score'} ${s.knowledgeScore}%`;
  const v = metric.value(s);
  return v === null ? '–' : `${v}%`;
}

export type ScaleMode = 'quantile' | 'equal';
export const CLASS_COUNT = 5;

/**
 * Lower bounds of classes 2..5. Quantile breaks keep one very large province
 * (Bangkok) from pushing every other province into the lightest class.
 */
export function classBreaks(values: number[], mode: ScaleMode, classes = CLASS_COUNT): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const [min, max] = [sorted[0], sorted[sorted.length - 1]];
  if (min === max) return [];
  return Array.from({ length: classes - 1 }, (_, i) => {
    const q = (i + 1) / classes;
    return mode === 'equal' ? min + (max - min) * q : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  });
}

/** 0-based class for a value; with no breaks every value sits in the middle class. */
export const classOf = (value: number, breaks: number[]) => (breaks.length ? breaks.filter(b => value >= b).length : Math.floor(CLASS_COUNT / 2));
