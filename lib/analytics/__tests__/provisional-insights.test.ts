import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answerPatternSignature, buildProvisionalInsightPrompt, parseProvisionalInsight } from '../provisional-insights';

const context = {
  quizName: 'Food labels',
  quizDescription: 'Read serving sizes',
  audience: 'public' as const,
  locale: 'th' as const,
  answers: [{
    question: 'What should you check?',
    selected: 'Only the front label',
    selectedExplanation: 'Check the serving size before comparing products.',
    selectedAligned: false,
    alignedChoices: [{ text: 'The serving size', explanation: 'Use the table on the package.' }],
  }],
};

test('provisional prompt contains the recorded selection, key and explanation, but no user ID', () => {
  const prompt = buildProvisionalInsightPrompt(context);
  assert.match(prompt, /Food labels/);
  assert.match(prompt, /The serving size/);
  assert.match(prompt, /Player selected: Only the front label/);
  assert.match(prompt, /Check the serving size before comparing products/);
  assert.match(prompt, /Do not invent any other selection/);
});

test('accepts feedback about a selected answer but rejects invented score and medical claims', () => {
  const general = { headline: 'อ่านฉลากให้ครบ', body: 'ลองดูปริมาณต่อหนึ่งหน่วยบริโภคในตารางก่อนเปรียบเทียบผลิตภัณฑ์', suggestion: 'ทบทวนคำอธิบายของแต่ละข้อ' };
  assert.equal(parseProvisionalInsight(JSON.stringify(general), 'th').ok, true);
  assert.equal(parseProvisionalInsight(JSON.stringify({ ...general, body: 'คุณเลือกดูแค่หน้าซองและควรอ่านปริมาณต่อหน่วยบริโภค' }), 'th').ok, true);
  assert.equal(parseProvisionalInsight(JSON.stringify({ ...general, body: 'You scored poorly on this quiz.' }), 'th').ok, false);
  assert.equal(parseProvisionalInsight(JSON.stringify({ ...general, body: 'คุณมีอาการของโรคนี้' }), 'th').ok, false);
});

test('rejects an English summary for Thai and a Thai summary for English', () => {
  const thai = { headline: 'อ่านฉลากให้ครบ', body: 'ลองดูปริมาณต่อหนึ่งหน่วยบริโภคในตารางก่อนเปรียบเทียบผลิตภัณฑ์', suggestion: 'ทบทวนคำอธิบายของแต่ละข้อ' };
  const english = { headline: 'Read the whole label', body: 'Check the serving size in the nutrition table before comparing products.', suggestion: 'Review each answer explanation.' };
  assert.equal(parseProvisionalInsight(JSON.stringify(thai), 'th').ok, true);
  assert.equal(parseProvisionalInsight(JSON.stringify(english), 'en').ok, true);
  assert.equal(parseProvisionalInsight(JSON.stringify(english), 'th').ok, false);
  assert.equal(parseProvisionalInsight(JSON.stringify(thai), 'en').ok, false);
});

test('cache signature changes with the selected answer and source explanation', () => {
  const input = { ...context, quizId: 'quiz-1' };
  const first = answerPatternSignature(input);
  assert.equal(first, answerPatternSignature({ ...input }));
  assert.notEqual(first, answerPatternSignature({
    ...input,
    answers: [{ ...input.answers[0], selected: 'The serving size' }],
  }));
  assert.notEqual(first, answerPatternSignature({
    ...input,
    answers: [{ ...input.answers[0], selectedExplanation: 'Updated explanation' }],
  }));
});
