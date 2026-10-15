// CSV of one province's aggregate LSCVD figures next to Thailand's. Only
// aggregates go in: the same suppressed values the page hides stay empty.

import type { LscvdSummary, Rate } from './lscvd';
import type { ProvinceActivity } from '../db/lscvd-analytics';

type Row = [section: string, metric: string, province: string | number | null, provinceBase: number | null, thailand: string | number | null, thailandBase: number | null];

const cell = (v: string | number | null) => {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function provinceCsv({ provinceName, generatedAt, filters, minCell, summary, national, activity }: {
  provinceName: string; generatedAt: string; filters: string; minCell: number;
  summary: LscvdSummary; national: LscvdSummary; activity: ProvinceActivity | null;
}) {
  const rate = (section: string, metric: string, a: Rate | null | undefined, b: Rate | null | undefined): Row => [section, metric, a?.pct ?? null, a?.base ?? null, b?.pct ?? null, b?.base ?? null];
  const prev = (key: keyof NonNullable<LscvdSummary['prevalence']>, label: string) => rate('Risk factors (%)', label, summary.prevalence?.[key], national.prevalence?.[key]);
  const rows: Row[] = [
    ['People', 'Participants (analytics consent)', summary.participants, null, national.participants, null],
    ['People', 'Shared health answers', summary.healthResponders, null, national.healthResponders, null],
    ['Knowledge', 'Knowledge score (%)', summary.knowledgeScore, summary.participants, national.knowledgeScore, national.participants],
    prev('smoking', 'Current smoking'), prev('hypertension', 'High blood pressure'), prev('diabetes', 'Diabetes'),
    prev('highCholesterol', 'High cholesterol'), prev('overweight', 'BMI 25 or above'), prev('centralObesity', 'Central obesity'),
    prev('familyHistory', 'Family history'), prev('priorEvent', 'Previous heart attack or stroke'),
    rate('Risk', 'High risk: 3+ factors or previous event (%)', summary.highRisk, national.highRisk),
    ...(['0', '1', '2', '3+'] as const).map((label, i): Row => ['Risk groups (people)', `${label} risk factors`, summary.riskGroups?.[i] ?? null, summary.healthResponders, national.riskGroups?.[i] ?? null, national.healthResponders]),
    rate('Screening (%)', 'Lipid test within 5 years', summary.screened, national.screened),
    rate('Screening (%)', 'Test overdue or never', summary.overdueScreening, national.overdueScreening),
    rate('Screening (%)', 'Knows own LDL', summary.knowsLdl, national.knowsLdl),
    rate('Treatment (%)', 'LDL above goal', summary.ldlNotAtTarget, national.ldlNotAtTarget),
    ['Treatment cascade (people)', 'Told they have high cholesterol', summary.cascade?.diagnosed ?? null, null, national.cascade?.diagnosed ?? null, null],
    ['Treatment cascade (people)', 'Taking lipid-lowering medicine', summary.cascade?.treated ?? null, null, national.cascade?.treated ?? null, null],
    ['Treatment cascade (people)', 'Treated and LDL at goal', summary.cascade?.atTarget ?? null, null, national.cascade?.atTarget ?? null, null],
    ...(activity?.trend ?? []).flatMap((m): Row[] => [['Monthly activity', `${m.month} people`, m.people, null, null, null], ['Monthly activity', `${m.month} accuracy (%)`, m.accuracy, m.answers, null, null]]),
    ...(activity?.topQuizzes ?? []).map((q): Row => ['Top quizzes accuracy (%)', q.name, q.accuracy, q.people, null, null]),
    ...(activity?.retake ? [['Learning', 'First answer accuracy (%)', activity.retake.firstAccuracy, activity.retake.questions, null, null], ['Learning', 'Latest answer accuracy (%)', activity.retake.latestAccuracy, activity.retake.questions, null, null]] as Row[] : []),
  ];
  const header = [
    ['Province', provinceName], ['Generated', generatedAt], ['Filters', filters || 'none'],
    ['Note', `Aggregates only. Groups under ${minCell} people are left blank. Percentages exclude "don't know" answers; base is the number of people the percentage is out of.`],
    [],
    ['Section', 'Metric', 'Province', 'Province base', 'Thailand', 'Thailand base'],
  ];
  // BOM so spreadsheet apps read Thai text as UTF-8.
  return '﻿' + [...header, ...rows].map(r => r.map(v => cell(v as string | number | null)).join(',')).join('\r\n') + '\r\n';
}
