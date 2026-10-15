// Province-level LSCVD (lipid-related cardiovascular disease) indicators for
// the admin map. Pure aggregation over one row per participant so it can be
// unit-tested without Postgres. Suppression happens here, server-side: a
// suppressed metric is never sent to the browser.

import { z } from 'zod';
import type { HealthInput } from '../onboarding/survey';
import { PROVINCES, type ProvinceCode } from '../onboarding/provinces';

/** Smallest group whose metrics are shown. Smaller groups show only counts. */
export const MIN_CELL = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
/** Filters that change who is counted, so the server re-queries. Dates are Asia/Bangkok days. */
export const ProvinceFiltersSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  quiz: z.string().uuid().optional(),
  age: z.enum(['under18', '18_29', '30_44', '45_59', '60plus']).optional(),
  gender: z.enum(['female', 'male', 'other']).optional(),
}).strict().refine(f => !f.from || !f.to || f.from <= f.to, { path: ['to'] });
export type ProvinceFilters = z.infer<typeof ProvinceFiltersSchema>;
/** Query keys the province APIs accept; other page state stays in the browser. */
export const PROVINCE_FILTER_KEYS = ['from', 'to', 'quiz', 'age', 'gender'] as const;

export type ParticipantRow = {
  province: ProvinceCode;
  /** Demographic answers and quiz results may be summarised only with this consent. */
  analyticsConsent: boolean;
  gender: 'female' | 'male' | 'other' | 'prefer_not_to_say';
  weightKg: number | null;
  heightCm: number | null;
  /** Present only while health consent is given. */
  health: HealthInput | null;
  /** Latest answer per question within the active filters. */
  answered: number;
  positive: number;
};

/** count / base, where base excludes "unknown" answers. pct is 0–100, null with no base. */
export type Rate = { count: number; base: number; pct: number | null };

export type LscvdSummary = {
  /** People with analytics consent — the group the knowledge score describes. */
  participants: number;
  /** People with health consent — the group every health metric describes. */
  healthResponders: number;
  suppressed: boolean;
  healthSuppressed: boolean;
  knowledgeScore: number | null;
  prevalence: { smoking: Rate; hypertension: Rate; diabetes: Rate; highCholesterol: Rate; overweight: Rate; centralObesity: Rate; familyHistory: Rate; priorEvent: Rate } | null;
  /** Reported risk factors per person: 0, 1, 2, 3+. */
  riskGroups: [number, number, number, number] | null;
  /** 3+ risk factors, or a previous heart attack or stroke. */
  highRisk: Rate | null;
  /** Lipid test within 5 years. */
  screened: Rate | null;
  /** Never tested or last test over 5 years ago. */
  overdueScreening: Rate | null;
  knowsLdl: Rate | null;
  ldlNotAtTarget: Rate | null;
  /** Among people told they have high cholesterol. */
  cascade: { diagnosed: number; treated: number; atTarget: number } | null;
};

const rate = (count: number, base: number): Rate => ({ count, base, pct: base > 0 ? Math.round((count / base) * 1000) / 10 : null });
const share = (rows: HealthInput[], known: (h: HealthInput) => boolean, hit: (h: HealthInput) => boolean) => {
  const base = rows.filter(known);
  return rate(base.filter(hit).length, base.length);
};

const bmi = (r: ParticipantRow) => r.analyticsConsent && r.weightKg && r.heightCm ? r.weightKg / (r.heightCm / 100) ** 2 : null;
// Asian cut-offs: BMI ≥ 25; waist ≥ 90 cm (men) / ≥ 80 cm (women).
const overweight = (r: ParticipantRow) => { const value = bmi(r); return value === null ? null : value >= 25; };
const centralObesity = (r: ParticipantRow) => {
  const waist = r.health?.waistCm;
  if (!waist || !r.analyticsConsent || (r.gender !== 'male' && r.gender !== 'female')) return null;
  return waist >= (r.gender === 'male' ? 90 : 80);
};

export function riskFactorCount(r: ParticipantRow) {
  const h = r.health;
  if (!h) return 0;
  return [h.smoking === 'current', h.hypertension === 'yes', h.diabetes === 'yes', h.highCholesterol === 'yes', h.familyHistory === 'yes', overweight(r) === true]
    .filter(Boolean).length;
}

/**
 * Simplified LDL goal from self-reported ranges: below 70 mg/dL after a heart
 * attack or stroke or with diabetes, otherwise below 100 mg/dL. The 55 mg/dL
 * very-high-risk goal cannot be read from the ranges collected.
 */
export function ldlAtTarget(h: HealthInput): boolean | null {
  if (h.ldlRange === 'unknown') return null;
  const higherRisk = h.priorEvent === 'yes' || h.diabetes === 'yes';
  return higherRisk ? h.ldlRange === 'lt70' : h.ldlRange === 'lt70' || h.ldlRange === '70_99';
}

export function summarize(rows: ParticipantRow[], minCell = MIN_CELL): LscvdSummary {
  const consenting = rows.filter(r => r.analyticsConsent);
  const responders = rows.filter((r): r is ParticipantRow & { health: HealthInput } => r.health !== null);
  const suppressed = consenting.length < minCell;
  const healthSuppressed = responders.length < minCell;
  const scored = consenting.filter(r => r.answered > 0);
  const summary: LscvdSummary = {
    participants: consenting.length, healthResponders: responders.length, suppressed, healthSuppressed,
    knowledgeScore: suppressed || !scored.length ? null : Math.round(scored.reduce((sum, r) => sum + r.positive / r.answered, 0) / scored.length * 100),
    prevalence: null, riskGroups: null, highRisk: null, screened: null, overdueScreening: null, knowsLdl: null, ldlNotAtTarget: null, cascade: null,
  };
  if (healthSuppressed) return summary;

  const h = responders.map(r => r.health);
  const yes = (key: 'hypertension' | 'diabetes' | 'highCholesterol' | 'familyHistory' | 'priorEvent') => share(h, x => x[key] !== 'unknown', x => x[key] === 'yes');
  const measured = (test: (r: ParticipantRow) => boolean | null) => { const values = responders.map(test).filter((v): v is boolean => v !== null); return rate(values.filter(Boolean).length, values.length); };
  summary.prevalence = {
    smoking: share(h, x => x.smoking !== 'unknown', x => x.smoking === 'current'),
    hypertension: yes('hypertension'), diabetes: yes('diabetes'), highCholesterol: yes('highCholesterol'),
    overweight: measured(overweight), centralObesity: measured(centralObesity),
    familyHistory: yes('familyHistory'), priorEvent: yes('priorEvent'),
  };
  const counts = responders.map(riskFactorCount);
  summary.riskGroups = [0, 1, 2, 3].map(n => counts.filter(c => (n === 3 ? c >= 3 : c === n)).length) as [number, number, number, number];
  summary.highRisk = rate(responders.filter((r, i) => counts[i] >= 3 || r.health.priorEvent === 'yes').length, responders.length);
  summary.screened = share(h, x => x.lipidCheck !== 'unknown', x => x.lipidCheck === 'within_1y' || x.lipidCheck === 'within_5y');
  summary.overdueScreening = share(h, x => x.lipidCheck !== 'unknown', x => x.lipidCheck === 'over_5y' || x.lipidCheck === 'never');
  summary.knowsLdl = rate(h.filter(x => x.ldlRange !== 'unknown').length, h.length);
  summary.ldlNotAtTarget = share(h, x => ldlAtTarget(x) !== null, x => ldlAtTarget(x) === false);
  const diagnosed = h.filter(x => x.highCholesterol === 'yes');
  const treated = diagnosed.filter(x => x.lipidMedication === 'yes');
  summary.cascade = { diagnosed: diagnosed.length, treated: treated.length, atTarget: treated.filter(x => ldlAtTarget(x) === true).length };
  return summary;
}

export function summarizeProvinces(rows: ParticipantRow[], minCell = MIN_CELL) {
  const byProvince = new Map<ProvinceCode, ParticipantRow[]>(PROVINCES.map(p => [p.code, []]));
  for (const row of rows) byProvince.get(row.province)?.push(row);
  return {
    minCell,
    national: summarize(rows, minCell),
    provinces: Object.fromEntries([...byProvince].map(([code, list]) => [code, summarize(list, minCell)])) as Record<string, LscvdSummary>,
  };
}
export type ProvinceReport = ReturnType<typeof summarizeProvinces>;

export type PersonalFactor = 'smoking' | 'hypertension' | 'diabetes' | 'highCholesterol' | 'familyHistory' | 'overweight';
export type PersonalLscvd = {
  /** Same factors, in the same order, that riskFactorCount() counts. */
  factors: Record<PersonalFactor, boolean | null>;
  riskCount: number;
  bmi: number | null;
  centralObesity: boolean | null;
  /** Same rule as the province "high risk" metric. */
  highRisk: boolean;
  screening: 'recent' | 'overdue' | 'unknown';
  ldlAtTarget: boolean | null;
};

/** One person's own answers, read with the same cut-offs as the admin map. */
export function personalLscvd(p: { gender: ParticipantRow['gender']; weightKg: number | null; heightCm: number | null; health: HealthInput }): PersonalLscvd {
  const h = p.health;
  const flag = (v: 'yes' | 'no' | 'unknown') => (v === 'unknown' ? null : v === 'yes');
  const bmi = p.weightKg && p.heightCm ? Math.round((p.weightKg / (p.heightCm / 100) ** 2) * 10) / 10 : null;
  const factors: Record<PersonalFactor, boolean | null> = {
    smoking: h.smoking === 'unknown' ? null : h.smoking === 'current',
    hypertension: flag(h.hypertension),
    diabetes: flag(h.diabetes),
    highCholesterol: flag(h.highCholesterol),
    familyHistory: flag(h.familyHistory),
    overweight: bmi === null ? null : bmi >= 25,
  };
  const riskCount = Object.values(factors).filter(v => v === true).length;
  return {
    factors, riskCount, bmi,
    centralObesity: !h.waistCm || (p.gender !== 'male' && p.gender !== 'female') ? null : h.waistCm >= (p.gender === 'male' ? 90 : 80),
    highRisk: riskCount >= 3 || h.priorEvent === 'yes',
    screening: h.lipidCheck === 'within_1y' || h.lipidCheck === 'within_5y' ? 'recent' : h.lipidCheck === 'unknown' ? 'unknown' : 'overdue',
    ldlAtTarget: ldlAtTarget(h),
  };
}
