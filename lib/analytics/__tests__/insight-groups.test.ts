import test from 'node:test';
import assert from 'node:assert/strict';
import { groupProvisionalInsights, hasBothInsightLanguages } from '../insight-groups';
import type { ProvisionalInsight } from '../../db/provisional-insights';

export const insightRow = (overrides: Partial<ProvisionalInsight> = {}): ProvisionalInsight => ({
  id: 'th-row', quiz_id: 'quiz', quiz_name: 'Food quiz', audience: 'public', locale: 'th',
  answer_signature: 'personal-th', answer_context: { quizName: 'Food quiz', quizDescription: null,
    learningFocus: { topic: 'อาหาร', question: 'Read which label?' },
    answers: [{ question: 'Read which label?', selected: 'Front', selectedExplanation: 'Missing portions', selectedAligned: false,
      alignedChoices: [{ text: 'Serving size', explanation: 'Compare portions' }] }] },
  status: 'provisional', headline: 'ทบทวนฉลากอาหาร', body: 'อ่านปริมาณต่อหนึ่งหน่วยบนฉลากอาหาร', suggestion: null,
  model: 'test', reviewed_by: null, reviewed_at: null, updated_at: '2026-10-08T00:00:00Z', revision: 'revision-th', ...overrides,
});

test('Thai and English with identical evidence are one summary despite localized focus and separate signatures', () => {
  const th = insightRow();
  const en = insightRow({ id: 'en-row', locale: 'en', answer_signature: 'personal-en', answer_context: { ...th.answer_context!, learningFocus: { topic: 'Food', question: 'Read which label?' } } });
  const [group] = groupProvisionalInsights([th, en]);
  assert.equal(group.members.length, 2); assert.equal(group.headline, th.headline);
  assert.equal(hasBothInsightLanguages(group.members), true);
  assert.equal(group.status, 'provisional');
  assert.equal(groupProvisionalInsights([en, th])[0].id, group.id, 'Selection identity must survive polling order changes');
});

test('approval applies to the whole group, including a historically approved TH and pending EN', () => {
  const th = insightRow({ status: 'approved' });
  const en = insightRow({ id: 'en-row', locale: 'en' });
  assert.equal(groupProvisionalInsights([th, en])[0].status, 'provisional');
  const approved = groupProvisionalInsights([th, { ...en, status: 'approved' }]);
  assert.equal(approved.length, 1); assert.equal(approved[0].status, 'approved');
  assert.equal(approved.filter(group => group.members.some(row => row.locale === 'en'))[0].status, 'approved');
});

test('different quizzes, audiences, recorded selections or authored explanations never merge', () => {
  const base = insightRow();
  for (const other of [insightRow({ id: 'other', quiz_id: 'other' }), insightRow({ id: 'other', audience: 'hcp' }),
    insightRow({ id: 'other', answer_context: { ...base.answer_context!, answers: [{ ...base.answer_context!.answers[0], selected: 'Different' }] } }),
    insightRow({ id: 'other', answer_context: { ...base.answer_context!, answers: [{ ...base.answer_context!.answers[0], selectedExplanation: 'Changed explanation' }] } })]) {
    assert.equal(groupProvisionalInsights([base, other]).length, 2);
  }
});

test('rejected archived evidence stays separate from a newly generated active draft', () => {
  const archived = insightRow({ status: 'rejected' });
  const active = insightRow({ id: 'new', locale: 'en' });
  assert.equal(groupProvisionalInsights([archived, active]).length, 2);
});

test('old summaries without evidence remain independent unless explicitly translated', () => {
  const old = insightRow({ answer_context: null });
  assert.equal(groupProvisionalInsights([old, insightRow({ id: 'unrelated', answer_context: null })]).length, 2);
  const translated = insightRow({ id: 'translated', locale: 'en', answer_context: null, answer_signature: 'translation:th-row' });
  assert.equal(groupProvisionalInsights([old, translated]).length, 1);
  const retained = [old, translated].map(row => ({ ...row, status: 'rejected' as const, answer_signature: `retained-group:th-row:${row.id}` }));
  assert.equal(groupProvisionalInsights(retained).length, 1);
});

test('grouping preserves every language variant and never treats two Thai rows as bilingual', () => {
  const rows = [insightRow(), insightRow({ id: 'other-th' })];
  const group = groupProvisionalInsights(rows)[0];
  assert.equal(group.members.length, 2); assert.equal(hasBothInsightLanguages(group.members), false);
  assert.deepEqual(group.members.map(row => row.id).sort(), rows.map(row => row.id).sort());
});

test('an old single-language approval stays in the review queue until both languages exist', () => {
  const [group] = groupProvisionalInsights([insightRow({ status: 'approved' })]);
  assert.equal(group.status, 'provisional');
  assert.equal(hasBothInsightLanguages(group.members), false);
});
