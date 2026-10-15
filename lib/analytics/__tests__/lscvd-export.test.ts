import test from 'node:test';
import assert from 'node:assert/strict';
import { provinceCsv } from '../lscvd-export';
import { summarize, type ParticipantRow } from '../lscvd';

const health = { waistCm: null, smoking: 'current', hypertension: 'yes', diabetes: 'no', highCholesterol: 'yes', lipidCheck: 'within_1y', ldlRange: '70_99', lipidMedication: 'yes', familyHistory: 'no', priorEvent: 'no' } as const;
const row: ParticipantRow = { province: 'TH-50', analyticsConsent: true, gender: 'male', weightKg: 70, heightCm: 170, health, answered: 2, positive: 1 };
const base = { provinceName: 'เชียงใหม่', generatedAt: '2026-10-15', filters: 'gender=male', minCell: 10 };

test('CSV has a BOM, a header and aggregate rows with Thailand alongside', () => {
  const csv = provinceCsv({ ...base, summary: summarize(Array(10).fill(row)), national: summarize(Array(30).fill(row)), activity: { trend: [{ month: '2026-10', people: 10, answers: 20, accuracy: 50 }], topQuizzes: [{ id: 'q', name: 'Lipids, "basics"', people: 10, accuracy: 50 }], retake: null } });
  assert.ok(csv.startsWith('﻿Province,เชียงใหม่\r\n'));
  const lines = csv.trim().split('\r\n');
  assert.ok(lines.includes('People,Participants (analytics consent),10,,30,'));
  assert.ok(lines.includes('Risk factors (%),Current smoking,100,10,100,30'));
  assert.ok(lines.includes('Treatment cascade (people),Treated and LDL at goal,10,,30,'));
  assert.ok(lines.includes('Top quizzes accuracy (%),"Lipids, ""basics""",50,10,,'));
  assert.ok(lines.includes('Monthly activity,2026-10 accuracy (%),50,20,,'));
});

test('suppressed figures stay blank and no individual data appears', () => {
  const csv = provinceCsv({ ...base, summary: summarize(Array(3).fill(row)), national: summarize(Array(30).fill(row)), activity: null });
  const lines = csv.trim().split('\r\n');
  assert.ok(lines.includes('Risk factors (%),Current smoking,,,100,30'));
  assert.ok(lines.includes('Knowledge,Knowledge score (%),,3,50,30'));
  assert.ok(!/TH-50|male,70/.test(csv.split('Section,')[1]));
});
