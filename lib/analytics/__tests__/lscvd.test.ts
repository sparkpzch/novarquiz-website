import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summarizeProvinces, riskFactorCount, ldlAtTarget, personalLscvd, MIN_CELL, type ParticipantRow } from '../lscvd';
import type { HealthInput } from '../../onboarding/survey';

const health: HealthInput = { waistCm: null, smoking: 'never', hypertension: 'no', diabetes: 'no', highCholesterol: 'no', lipidCheck: 'within_1y', ldlRange: 'lt70', lipidMedication: 'no', familyHistory: 'no', priorEvent: 'no' };
const person = (over: Partial<ParticipantRow> = {}): ParticipantRow => ({ province: 'TH-50', analyticsConsent: true, gender: 'male', weightKg: 60, heightCm: 170, health, answered: 10, positive: 5, ...over });
const many = (n: number, over: Partial<ParticipantRow> = {}) => Array.from({ length: n }, () => person(over));

test('groups below the minimum cell show counts only', () => {
  const small = summarize(many(MIN_CELL - 1));
  assert.equal(small.participants, MIN_CELL - 1); assert.equal(small.healthResponders, MIN_CELL - 1);
  assert.equal(small.suppressed, true); assert.equal(small.healthSuppressed, true);
  for (const key of ['knowledgeScore', 'prevalence', 'riskGroups', 'highRisk', 'screened', 'overdueScreening', 'knowsLdl', 'ldlNotAtTarget', 'cascade'] as const) assert.equal(small[key], null, key);
  const enough = summarize(many(MIN_CELL));
  assert.equal(enough.suppressed, false); assert.equal(enough.healthSuppressed, false);
  assert.equal(enough.knowledgeScore, 50); assert.notEqual(enough.prevalence, null);
});

test('health and analytics consent are counted separately', () => {
  const rows = [...many(MIN_CELL, { health: null }), ...many(MIN_CELL - 1, { analyticsConsent: false })];
  const s = summarize(rows);
  assert.equal(s.participants, MIN_CELL); assert.equal(s.healthResponders, MIN_CELL - 1);
  assert.equal(s.suppressed, false); assert.equal(s.healthSuppressed, true);
  assert.equal(s.prevalence, null);
  // Without analytics consent, quiz results never reach the knowledge score.
  assert.equal(summarize([...many(MIN_CELL), ...many(5, { analyticsConsent: false, positive: 0 })]).knowledgeScore, 50);
});

test('knowledge score weighs each person equally and skips people with no answers', () => {
  const s = summarize([...many(9, { answered: 10, positive: 10 }), person({ answered: 100, positive: 0 }), person({ answered: 0, positive: 0 })]);
  assert.equal(s.knowledgeScore, 90);
});

test('rates exclude unknown answers from the denominator', () => {
  const rows = [...many(6, { health: { ...health, smoking: 'current' } }), ...many(2, { health: { ...health, smoking: 'unknown' } }), ...many(2)];
  const smoking = summarize(rows).prevalence!.smoking;
  assert.deepEqual(smoking, { count: 6, base: 8, pct: 75 });
});

test('BMI and waist use Asian cut-offs and need demographic consent', () => {
  const rows = [
    ...many(5, { weightKg: 75, heightCm: 170 }), // BMI 26
    ...many(3, { weightKg: 70, heightCm: 170, analyticsConsent: false }), // BMI 24.2, but not usable
    ...many(2, { weightKg: null }),
  ];
  assert.deepEqual(summarize(rows).prevalence!.overweight, { count: 5, base: 5, pct: 100 });
  const waist = summarize([...many(5, { gender: 'male', health: { ...health, waistCm: 90 } }), ...many(5, { gender: 'female', health: { ...health, waistCm: 79 } }), person({ gender: 'other', health: { ...health, waistCm: 120 } })]).prevalence!.centralObesity;
  assert.deepEqual(waist, { count: 5, base: 10, pct: 50 });
});

test('risk factors count reported conditions; high risk is 3+ or a previous event', () => {
  assert.equal(riskFactorCount(person({ health: { ...health, smoking: 'current', hypertension: 'yes', diabetes: 'yes' }, weightKg: 80 })), 4);
  assert.equal(riskFactorCount(person({ health: { ...health, hypertension: 'unknown' } })), 0);
  const rows = [...many(4), ...many(3, { health: { ...health, smoking: 'current', hypertension: 'yes', highCholesterol: 'yes' } }), ...many(2, { health: { ...health, priorEvent: 'yes' } }), person({ health: { ...health, diabetes: 'yes' } })];
  const s = summarize(rows);
  assert.deepEqual(s.riskGroups, [6, 1, 0, 3]);
  assert.deepEqual(s.highRisk, { count: 5, base: 10, pct: 50 });
});

test('LDL goal is stricter after a heart attack or stroke, or with diabetes', () => {
  assert.equal(ldlAtTarget({ ...health, ldlRange: '70_99' }), true);
  assert.equal(ldlAtTarget({ ...health, ldlRange: '70_99', priorEvent: 'yes' }), false);
  assert.equal(ldlAtTarget({ ...health, ldlRange: '70_99', diabetes: 'yes' }), false);
  assert.equal(ldlAtTarget({ ...health, ldlRange: 'lt70', priorEvent: 'yes' }), true);
  assert.equal(ldlAtTarget({ ...health, ldlRange: '100_129' }), false);
  assert.equal(ldlAtTarget({ ...health, ldlRange: 'unknown' }), null);
});

test('screening and the treatment cascade', () => {
  const rows = [
    ...many(4, { health: { ...health, highCholesterol: 'yes', lipidMedication: 'yes', ldlRange: '70_99' } }), // treated, at target
    ...many(2, { health: { ...health, highCholesterol: 'yes', lipidMedication: 'yes', ldlRange: '160_189', lipidCheck: 'over_5y' } }),
    ...many(2, { health: { ...health, highCholesterol: 'yes', lipidMedication: 'no', ldlRange: 'unknown', lipidCheck: 'never' } }),
    ...many(2, { health: { ...health, lipidCheck: 'unknown', ldlRange: 'unknown' } }),
  ];
  const s = summarize(rows);
  assert.deepEqual(s.cascade, { diagnosed: 8, treated: 6, atTarget: 4 });
  assert.deepEqual(s.screened, { count: 4, base: 8, pct: 50 });
  assert.deepEqual(s.overdueScreening, { count: 4, base: 8, pct: 50 });
  assert.deepEqual(s.knowsLdl, { count: 6, base: 10, pct: 60 });
  assert.deepEqual(s.ldlNotAtTarget, { count: 2, base: 6, pct: 33.3 });
});

test('every province is reported, and the national total includes small provinces', () => {
  // A threshold above the default keeps the small-province path covered.
  const report = summarizeProvinces([...many(3, { province: 'TH-10' }), ...many(2, { province: 'TH-96' })], 3);
  assert.equal(Object.keys(report.provinces).length, 77);
  assert.equal(report.provinces['TH-10'].suppressed, false);
  assert.equal(report.provinces['TH-96'].suppressed, true); assert.equal(report.provinces['TH-96'].participants, 2);
  assert.equal(report.provinces['TH-50'].participants, 0);
  assert.equal(report.national.participants, 5);
  assert.equal(report.minCell, 3);
});

test('personal view counts the same risk factors as the province summary', () => {
  const answers = { ...health, smoking: 'current', diabetes: 'yes', familyHistory: 'unknown', lipidCheck: 'never', ldlRange: '70_99' } as const;
  const mine = personalLscvd({ gender: 'male', weightKg: 80, heightCm: 170, health: answers });
  assert.equal(mine.riskCount, riskFactorCount(person({ weightKg: 80, health: answers })));
  assert.equal(mine.riskCount, 3);
  assert.equal(mine.factors.familyHistory, null);
  assert.equal(mine.bmi, 27.7);
  assert.equal(mine.highRisk, true);
  assert.equal(mine.screening, 'overdue');
  // Diabetes lowers the LDL goal to below 70.
  assert.equal(mine.ldlAtTarget, false);
  const low = personalLscvd({ gender: 'female', weightKg: null, heightCm: null, health: { ...health, priorEvent: 'yes' } });
  assert.equal(low.riskCount, 0); assert.equal(low.highRisk, true); assert.equal(low.factors.overweight, null);
});
