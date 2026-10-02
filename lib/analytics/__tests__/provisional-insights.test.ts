import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answerPatternSignature, approvedAnswerCoverage, buildProvisionalInsightPrompt, parseProvisionalInsight } from '../provisional-insights';

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

test('everyday coaching changes the cache and prompt without altering professional feedback', () => {
  const standard = { ...context, quizId: 'quiz-1' };
  const everyday = { ...standard, readingStyle: 'everyday' as const, audience: 'hcp' as const };
  assert.notEqual(answerPatternSignature(standard), answerPatternSignature(everyday));
  const prompt = buildProvisionalInsightPrompt(everyday);
  assert.match(prompt, /an everyday reader with no medical training/);
  assert.match(prompt, /not a game or a clinician report/);
  assert.match(prompt, /one specific question/);
  const specialist = JSON.stringify({ headline: 'Screening and adherence', body: 'Review the clinical guideline.', suggestion: 'Review risk_factors.' });
  assert.equal(parseProvisionalInsight(specialist, 'en').ok, true);
  assert.equal(parseProvisionalInsight(specialist, 'en', 'everyday').ok, false);
});

test('shuffling questions or answer keys preserves the answer cache signature', () => {
  const second = { ...context.answers[0], question: 'Which table?', selected: 'Nutrition table' };
  const input = { ...context, quizId: 'quiz-1', answers: [context.answers[0], second] };
  assert.equal(answerPatternSignature(input), answerPatternSignature({ ...input, answers: [...input.answers].reverse() }));
});

test('approved wording is reusable only when all source answers match at 80% coverage or more', () => {
  const answers = Array.from({ length: 5 }, (_, index) => ({ ...context.answers[0], question: `Question ${index}` }));
  const target = { ...context, answers };
  assert.equal(approvedAnswerCoverage(target, target), 1);
  assert.equal(approvedAnswerCoverage({ ...target, answers: answers.slice(0, 4) }, target), 0.8);
  assert.equal(approvedAnswerCoverage({ ...target, answers: answers.slice(0, 3) }, target), 0);
  assert.equal(approvedAnswerCoverage(target, { ...target, answers: [...answers].reverse() }), 1);
  assert.equal(approvedAnswerCoverage(target, { ...target, quizName: 'Updated quiz' }), 0);
  assert.equal(approvedAnswerCoverage(target, { ...target, answers: answers.slice(0, 4) }), 0);
  assert.equal(approvedAnswerCoverage({ ...target, answers: [] }, target), 0);
});

test('similar scores do not permit reuse of wording about different selections or explanations', () => {
  for (const changed of [
    { selected: 'The serving size' },
    { selectedExplanation: 'A revised explanation' },
    { selectedAligned: true },
    { alignedChoices: [{ text: 'New key', explanation: null }] },
  ]) {
    assert.equal(approvedAnswerCoverage(context, { ...context, answers: [{ ...context.answers[0], ...changed }] }), 0);
  }
});

test('duplicate target answers cannot be used to manufacture source coverage', () => {
  const source = { ...context, answers: [context.answers[0], context.answers[0]] };
  assert.equal(approvedAnswerCoverage(source, context), 0);
});
