import test from 'node:test';
import { geminiLiteModel } from '../gemini';
import assert from 'node:assert/strict';
import { prepareProvisionalInsight, type InsightDependencies } from '../auto-provisional-insight';
import { approvedAnswerCoverage, buildProvisionalInsightPrompt, answerPatternSignature, parseProvisionalInsight, sameAnswerPattern } from '../../analytics/provisional-insights';
import type { AnswerReviewContext, ProvisionalStatus } from '../../db/provisional-insights';
import { historyCoaching } from '../../analytics/history-coaching';
import type { HistoryAnswer, PersonalHistoryReport } from '../../analytics/history';

const food: AnswerReviewContext = {
  quizName: 'Everyday choices', quizDescription: null,
  learningFocus: { topic: 'Everyday food choices', question: 'Which part of the label helps compare portions?' },
  answers: [{ question: 'Which part of the label helps compare portions?', selected: 'Only the front label', selectedExplanation: 'The front label omits portion details.', selectedAligned: false, alignedChoices: [{ text: 'Serving size', explanation: 'Check serving size before comparing the food labels.' }] }],
};
const summary = { headline: 'Look closer at food labels', body: 'You chose the front label. The serving size helps compare portions.', suggestion: 'Check the serving size on the example label.' };
const input = { userId: 'private-john-id', quizId: 'quiz', audience: 'public' as const, locale: 'en' as const, readingStyle: 'everyday' as const, context: food, allowGeneration: true };

const perfectFood: AnswerReviewContext = {
  ...food,
  answers: [{ ...food.answers[0], selected: 'Serving size', selectedExplanation: 'Check serving size before comparing the food labels.', selectedAligned: true }],
};

test('fully correct answers request topic-specific praise in either language, without remedial hints', () => {
  for (const locale of ['en', 'th'] as const) {
    const prompt = buildProvisionalInsightPrompt({ ...perfectFood, locale, audience: 'public', readingStyle: 'everyday' });
    assert.match(prompt, /every answer is correct/);
    assert.match(prompt, /Acknowledge correct answers on this topic: Everyday food choices/);
    assert.match(prompt, /praising understanding of a specific quiz subject/);
    assert.match(prompt, /Player selected: Serving size/);
    assert.match(prompt, new RegExp(`Write every JSON text field .* in ${locale === 'th' ? 'Thai' : 'English'}`));
    assert.doesNotMatch(prompt, /Focus on the topic with the most missed questions|Use this recorded question for the hint|combining a recorded choice with its useful learning hint/);
  }
  const mixed = buildProvisionalInsightPrompt({ ...food, locale: 'en', audience: 'public', readingStyle: 'everyday' });
  assert.match(mixed, /some recorded answers need another look/);
  assert.doesNotMatch(mixed, /Outcome across ALL recorded answers: every answer is correct/);
  const empty = buildProvisionalInsightPrompt({ ...food, answers: [], locale: 'en', audience: 'public' });
  assert.doesNotMatch(empty, /Outcome across ALL recorded answers: every answer is correct/);
});

test('fully correct praise is reusable across correct paths but not paths with an additional miss', () => {
  const source = { ...perfectFood, answers: Array.from({ length: 4 }, (_, i) => ({ ...perfectFood.answers[0], question: `Food example ${i}` })) };
  const correctTarget = { ...source, answers: [...source.answers, { ...perfectFood.answers[0], question: 'Extra question' }] };
  const mixedTarget = { ...source, answers: [...source.answers, { ...food.answers[0], question: 'Extra question' }] };
  assert.equal(approvedAnswerCoverage(source, correctTarget), 0.8);
  assert.equal(approvedAnswerCoverage(source, mixedTarget), 0);
  assert.equal(approvedAnswerCoverage(perfectFood, perfectFood), 1);
});

function fixture(context = food, generatedSummary: { headline: string; body: string; suggestion: string | null } = summary) {
  let status: ProvisionalStatus | null = null;
  let calls = 0;
  let saves = 0;
  let failures = 0;
  const row = () => ({ ...generatedSummary, id: 'draft', quiz_id: 'quiz', audience: 'public' as const, locale: 'en' as const, answer_signature: 'signature', answer_context: context, status: status!, model: 'test', reviewed_by: null, reviewed_at: null, updated_at: 'now', revision: 'claim' });
  const dependencies: InsightDependencies = {
    isAnswerPatternRejected: async () => status === 'rejected',
    getSimilarReusableInsight: async (_quiz, _audience, _locale, target) => (status === 'approved' || status === 'provisional') && approvedAnswerCoverage(context, target) ? row() : null,
    getProvisionalInsight: async () => status === 'provisional' || status === 'approved' ? row() : null,
    getInsightGenerationState: async () => status,
    claimProvisionalInsight: async () => { if (status) return null; status = 'generating'; return { id: 'draft', claim_token: 'claim' }; },
    finishProvisionalInsight: async () => { if (status !== 'generating') return false; status = 'provisional'; saves++; return true; },
    failProvisionalInsight: async () => { status = 'failed'; failures++; },
    invalidateProvisionalLanguage: async () => { status = null; },
    getUserAnswerReviewContext: async () => context,
    generateText: async (prompt) => { calls++; assert.ok(!prompt.includes(input.userId)); return JSON.stringify(generatedSummary); },
    geminiModel: () => 'test', isGeminiConfigured: () => true,
  };
  return { dependencies, setStatus: (value: ProvisionalStatus) => { status = value; }, get calls() { return calls; }, get saves() { return saves; }, get failures() { return failures; } };
}

test('fully correct attempts return standard localized feedback without AI, cache writes, or approval labels', async () => {
  for (const locale of ['en', 'th'] as const) {
    const f = fixture(perfectFood);
    f.dependencies.isGeminiConfigured = () => false;
    const forbidden = async () => { throw new Error('Correct-answer recap accessed the AI cache'); };
    f.dependencies.claimProvisionalInsight = forbidden;
    f.dependencies.finishProvisionalInsight = forbidden;
    f.dependencies.getSimilarReusableInsight = forbidden;
    f.dependencies.getProvisionalInsight = forbidden;
    f.dependencies.isAnswerPatternRejected = forbidden;
    for (const readOnly of [false, true]) {
      const result = await prepareProvisionalInsight({ ...input, locale, context: perfectFood, allowGeneration: false, readOnly }, f.dependencies);
      assert.equal(result.state, 'standard');
      assert.equal(result.insight?.status, 'standard');
      assert.equal(result.generate, undefined);
      assert.match(result.insight!.summary.body, locale === 'th' ? /ตอบถูกทุกข้อ/ : /every question correctly/);
    }
    assert.equal(f.calls, 0); assert.equal(f.saves, 0);
    const mixed = await prepareProvisionalInsight(input, fixture().dependencies);
    assert.notEqual(mixed.state, 'standard');
    const empty = await prepareProvisionalInsight({ ...input, context: { ...perfectFood, answers: [] } }, f.dependencies);
    assert.equal(empty.state, 'unavailable');
  }
});

test('admin reports read pending and approved evidence without claims, writes, or Gemini calls', async () => {
  const f = fixture();
  const forbidden = async () => { throw new Error('Read-only report attempted a mutation'); };
  f.dependencies.claimProvisionalInsight = forbidden;
  f.dependencies.invalidateProvisionalLanguage = forbidden;
  f.dependencies.generateText = forbidden;
  const read = () => prepareProvisionalInsight({ ...input, readOnly: true }, f.dependencies);
  assert.equal((await read()).state, 'unavailable');
  f.setStatus('generating'); assert.equal((await read()).state, 'generating');
  f.setStatus('provisional');
  const pending = await read();
  assert.equal(pending.state, 'pending'); assert.equal(pending.generate, undefined);
  assert.deepEqual(pending.insight?.context, food); assert.deepEqual(pending.insight?.summary, summary);
  f.setStatus('approved'); assert.equal((await read()).state, 'approved');
  f.setStatus('rejected'); assert.deepEqual(await read(), { state: 'rejected' });
  assert.equal(f.calls, 0); assert.equal(f.saves, 0);
});

test('admin reports do not invalidate unsuitable saved text during a read', async () => {
  const f = fixture(); f.setStatus('provisional');
  const reusable = f.dependencies.getSimilarReusableInsight;
  f.dependencies.getSimilarReusableInsight = async (...args) => { const row = await reusable(...args); return row ? { ...row, headline: 'You’re doing well' } : null; };
  f.dependencies.getProvisionalInsight = async () => null;
  f.dependencies.invalidateProvisionalLanguage = async () => { throw new Error('Must not invalidate'); };
  assert.equal((await prepareProvisionalInsight({ ...input, readOnly: true }, f.dependencies)).state, 'unavailable');
});

test('completion prepares analysis without blocking; identical simultaneous reads share one generation lease', async () => {
  const f = fixture();
  const prepared = await prepareProvisionalInsight(input, f.dependencies);
  assert.equal(prepared.state, 'generating');
  assert.equal(f.calls, 0, 'Preparation must not call the model before the response');
  assert.ok(prepared.generate);
  const other = await prepareProvisionalInsight(input, f.dependencies);
  assert.equal(other.state, 'generating'); assert.equal(other.generate, undefined);
  const generated = await prepared.generate();
  assert.equal(generated?.status, 'provisional'); assert.equal(f.calls, 1); assert.equal(f.saves, 1);
  const waiting = await prepareProvisionalInsight(input, f.dependencies);
  assert.equal(waiting.state, 'pending'); assert.deepEqual(waiting.insight?.summary, summary); assert.equal(waiting.generate, undefined);
  f.setStatus('approved');
  const approved = await prepareProvisionalInsight({ ...input, userId: 'a-similar-person' }, f.dependencies);
  assert.equal(approved.state, 'approved'); assert.equal(f.calls, 1);
  f.setStatus('rejected');
  const rejected = await prepareProvisionalInsight(input, f.dependencies);
  assert.deepEqual(rejected, { state: 'rejected' }); assert.equal(f.calls, 1);
});

test('no consent or missing provider never queues a model call', async () => {
  const f = fixture();
  assert.deepEqual(await prepareProvisionalInsight({ ...input, allowGeneration: false }, f.dependencies), { state: 'consent-required' });
  f.dependencies.isGeminiConfigured = () => false;
  assert.deepEqual(await prepareProvisionalInsight(input, f.dependencies), { state: 'unavailable' });
  assert.equal(f.calls, 0);
});

test('invalid model output retries once and is never stored as a pending summary', async () => {
  const f = fixture();
  let calls = 0;
  f.dependencies.generateText = async () => { calls++; return JSON.stringify({ ...summary, headline: 'You’re doing well. Keep building on it.' }); };
  const prepared = await prepareProvisionalInsight(input, f.dependencies);
  assert.equal(await prepared.generate!(), null);
  assert.equal(calls, 2); assert.equal(f.saves, 0); assert.equal(f.failures, 1);
  assert.equal((await prepareProvisionalInsight(input, f.dependencies)).state, 'unavailable');
});

test('late generation cannot restore an insight rejected while the model was running', async () => {
  const f = fixture();
  const prepared = await prepareProvisionalInsight(input, f.dependencies);
  f.setStatus('rejected');
  assert.equal(await prepared.generate!(), null);
  assert.equal(f.saves, 0);
  assert.equal((await prepareProvisionalInsight(input, f.dependencies)).state, 'rejected');
});

test('a draft finishing during claim is returned as pending, not an unavailable summary', async () => {
  const f = fixture();
  f.dependencies.claimProvisionalInsight = async () => { f.setStatus('provisional'); return null; };
  const result = await prepareProvisionalInsight(input, f.dependencies);
  assert.equal(result.state, 'pending'); assert.deepEqual(result.insight?.summary, summary); assert.equal(f.calls, 0);
});

test('food hints and movement hints follow each person’s missed answers, not the total score', () => {
  const answer = (id: string, tags: string[], selectedAligned: boolean): HistoryAnswer => ({ ...food.answers[0], id, tags, selectedAligned, utilityScore: selectedAligned ? 1 : 0, maxUtility: 1, timeMs: null });
  const report = (answers: HistoryAnswer[]): PersonalHistoryReport => ({ session: {
    session_id: 'run', quiz_id: 'quiz', session_name: 'Everyday choices', session_description: null,
    total_score: 2, correct_count: 1, incorrect_count: 2, streak: 1, total_time_ms: null,
    completed_at: '2026-10-02T07:00:00Z', rank: 1, total_players: 1,
  }, answers, topics: [], feedback: null });
  const john = historyCoaching(report([answer('food1', ['nutrition'], false), answer('food2', ['nutrition'], false), answer('move', ['exercise'], true)]), 'en');
  const jane = historyCoaching(report([answer('food1', ['nutrition'], true), answer('move1', ['exercise'], false), answer('move2', ['exercise'], false)]), 'en');
  assert.equal(john.correct, jane.correct);
  assert.match(john.headline, /food/i); assert.match(jane.headline, /active/i);
  assert.notEqual(john.nextAnswer?.id, jane.nextAnswer?.id);
  const prompt = buildProvisionalInsightPrompt({ ...food, locale: 'en', audience: 'public', readingStyle: 'everyday' });
  assert.match(prompt, /Prioritise this learning topic: Everyday food choices/);
  assert.match(prompt, /Serving size/); assert.match(prompt, /only factual source/);
  assert.equal(parseProvisionalInsight(JSON.stringify(summary), 'en', 'everyday').ok, true);
});

test('approved reuse fails when added answers change the priority topic even with similar answer coverage', () => {
  const source = { ...food, answers: Array.from({ length: 4 }, (_, i) => ({ ...food.answers[0], question: `Food ${i}` })) };
  const target = { ...source, answers: [...source.answers, { ...food.answers[0], question: 'Which movement?' }], learningFocus: { topic: 'Staying active', question: 'Which movement?' } };
  assert.equal(approvedAnswerCoverage(source, target), 0);
  assert.equal(approvedAnswerCoverage(food, food), 1);
});


test('simultaneous completions from different accounts share one pending generation and approval only changes its label', async () => {
  const f = fixture();
  const keys: string[] = [];
  const originalClaim = f.dependencies.claimProvisionalInsight;
  f.dependencies.claimProvisionalInsight = async (...args) => { keys.push(args[3]); return originalClaim(...args); };
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => prepareProvisionalInsight({ ...input, userId: `person-${i}` }, f.dependencies)));
  assert.equal(new Set(keys).size, 1);
  assert.equal(burst.filter(result => result.generate).length, 1);
  assert.equal(f.calls, 0);
  await burst.find(result => result.generate)!.generate!();
  const pending = await prepareProvisionalInsight({ ...input, userId: 'new-person' }, f.dependencies);
  assert.equal(pending.state, 'pending'); assert.deepEqual(pending.insight?.summary, summary);
  assert.equal(f.calls, 1); assert.equal(f.saves, 1);
  f.setStatus('approved');
  const approved = await prepareProvisionalInsight({ ...input, userId: 'new-person' }, f.dependencies);
  assert.equal(approved.state, 'approved'); assert.deepEqual(approved.insight?.summary, pending.insight?.summary);
  assert.equal(f.calls, 1);
});

test('shared draft signatures change with recorded choices, quiz, audience, and language, while rejection matching ignores order', () => {
  const base = { ...food, quizId: 'quiz', audience: 'public' as const, locale: 'en' as const, readingStyle: 'everyday' as const };
  const key = answerPatternSignature(base);
  assert.equal(key, answerPatternSignature({ ...base, answers: [...base.answers].reverse() }));
  for (const other of [{ ...base, quizId: 'another-quiz' }, { ...base, audience: 'hcp' as const }, { ...base, locale: 'th' as const }, { ...base, answers: [{ ...food.answers[0], selected: 'Serving size' }] }]) {
    assert.notEqual(key, answerPatternSignature(other));
  }
  assert.equal(key, answerPatternSignature({ ...base, learningFocus: { topic: 'A changed topic', question: food.answers[0].question } }));
  assert.equal(sameAnswerPattern(food, { ...food, learningFocus: undefined }), true);
  assert.equal(sameAnswerPattern(food, { ...food, answers: [{ ...food.answers[0], selected: 'Serving size' }] }), false);
});

test('personal summaries always use Flash Lite, including when CMS overrides use a larger model', () => {
  const previous = process.env.GEMINI_MODEL;
  try {
    process.env.GEMINI_MODEL = 'gemini-large-pro';
    assert.equal(geminiLiteModel(), 'gemini-flash-lite-latest');
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
    assert.equal(geminiLiteModel(), 'gemini-3.1-flash-lite');
  } finally { if (previous === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = previous; }
});

test('large quizzes keep the highest-priority missed question and cap model source examples', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ...food.answers[0], question: `Food example ${i}?` }));
  const prompt = buildProvisionalInsightPrompt({ ...food, answers: many, learningFocus: { topic: 'Everyday food choices', question: 'Food example 39?' }, locale: 'en', audience: 'public', readingStyle: 'everyday' });
  assert.match(prompt, /Question: Food example 39/);
  assert.ok((prompt.match(/Player selected:/g) ?? []).length <= 8);
  assert.doesNotMatch(prompt, /Question: Food example 20/);
});


test('approved wording covers a nearby path with an extra answer and requires no model call', async () => {
  const f = fixture();
  const source = { ...food, answers: [food.answers[0], ...Array.from({ length: 3 }, (_, i) => ({ ...food.answers[0], question: `Food label example ${i}` }))] };
  const target = { ...source, answers: [...source.answers, { ...food.answers[0], question: 'Another part of the quiz', selectedAligned: true }] };
  assert.equal(approvedAnswerCoverage(source, target), 0.8);
  f.setStatus('approved');
  const approved = await f.dependencies.getSimilarReusableInsight('quiz', 'public', 'en', source);
  f.dependencies.getSimilarReusableInsight = async (_quiz, _audience, _locale, context) => approvedAnswerCoverage(source, context) ? approved : null;
  const reused = await prepareProvisionalInsight({ ...input, userId: 'jane', context: target }, f.dependencies);
  assert.equal(reused.state, 'approved'); assert.equal(reused.generate, undefined); assert.equal(f.calls, 0);
  assert.deepEqual(reused.insight?.summary, summary);
  assert.equal(approvedAnswerCoverage(source, { ...target, answers: [{ ...source.answers[0], selected: 'A different choice' }, ...target.answers.slice(1)] }), 0);
});


test('older approved summaries remain reusable for an identical answer pattern', () => {
  assert.equal(approvedAnswerCoverage({ ...food, learningFocus: undefined }, food), 1);
  const extra = { ...food, answers: [...food.answers, { ...food.answers[0], question: 'An extra question' }] };
  assert.equal(approvedAnswerCoverage({ ...food, learningFocus: undefined }, extra), 0);
});

test('oversized metadata cannot cause an unbounded paid model request', async () => {
  const f = fixture();
  const prepared = await prepareProvisionalInsight({ ...input, context: { ...food, quizDescription: 'X'.repeat(25_000) } }, f.dependencies);
  assert.equal(await prepared.generate!(), null);
  assert.equal(f.calls, 0); assert.equal(f.failures, 1);
});

test('a nearby path reuses a pending draft without a model call and keeps its unreviewed status', async () => {
  const f = fixture();
  f.setStatus('provisional');
  const source = { ...food, answers: Array.from({ length: 4 }, (_, i) => ({ ...food.answers[0], question: `Food example ${i}` })) };
  const target = { ...source, answers: [...source.answers, { ...food.answers[0], question: 'Extra question' }] };
  const row = await f.dependencies.getProvisionalInsight('quiz', 'public', 'en', 'test');
  f.dependencies.getSimilarReusableInsight = async (_quiz, _audience, _locale, context) => approvedAnswerCoverage(source, context) ? row : null;
  const pending = await prepareProvisionalInsight({ ...input, context: target, userId: 'another-person' }, f.dependencies);
  assert.equal(pending.state, 'pending'); assert.equal(pending.insight?.status, 'provisional');
  assert.deepEqual(pending.insight?.summary, summary); assert.equal(f.calls, 0);
});


test('identical answers reuse approved wording despite derived focus and automatic style checks', async () => {
  const reviewed = { headline: 'Screening and adherence', body: 'Review the clinical guideline.', suggestion: null };
  const f = fixture(food, reviewed);
  f.setStatus('approved');
  const target = { ...food, learningFocus: { topic: 'Another derived topic', question: food.answers[0].question } };
  assert.equal(approvedAnswerCoverage(food, target), 1);
  const result = await prepareProvisionalInsight({ ...input, context: target }, f.dependencies);
  assert.equal(result.state, 'approved');
  assert.deepEqual(result.insight?.summary, reviewed);
  assert.equal(result.generate, undefined);
  assert.equal(f.calls, 0); assert.equal(f.saves, 0);
});
