import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistoryTopics, type HistoryAnswer } from '../history';

const answer = (overrides: Partial<HistoryAnswer>): HistoryAnswer => ({
  id: 'question', question: 'Question', selected: 'A', selectedExplanation: null,
  selectedAligned: true, alignedChoices: [], utilityScore: 5, maxUtility: 10,
  timeMs: null, tags: [], ...overrides,
});

test('uses weighted utility and counts a duplicated question tag once', () => {
  const topics = summarizeHistoryTopics([
    answer({ tags: ['tag', 'tag', 'other'], utilityScore: 5, maxUtility: 10 }),
    answer({ tags: ['tag'], utilityScore: 1, maxUtility: 2 }),
  ]);
  assert.deepEqual(topics.find((t) => t.tag === 'tag'), {
    tag: 'tag', percentage: 50, earnedUtility: 6, maxUtility: 12, responses: 2, questionCount: 2,
  });
  assert.equal(topics.find((t) => t.tag === 'other')?.responses, 1);
});

test('distinguishes missing scoring data from zero understanding and clamps utility', () => {
  const topics = summarizeHistoryTopics([
    answer({ tags: ['unscored'], utilityScore: 0, maxUtility: 0 }),
    answer({ tags: ['negative'], utilityScore: -5 }),
    answer({ tags: ['over'], utilityScore: 50 }),
  ]);
  assert.deepEqual(topics.map((t) => [t.tag, t.percentage]), [['negative', 0], ['over', 100], ['unscored', null]]);
});

test('does not invent topic data for empty or untagged answers', () => {
  assert.deepEqual(summarizeHistoryTopics([]), []);
  assert.deepEqual(summarizeHistoryTopics([answer({})]), []);
});

import { historyCoaching, isEverydayInsight, learningTopic, personalLearningAreas } from '../history-coaching';
import type { PersonalHistoryReport } from '../history';

const report = (answers: HistoryAnswer[]): PersonalHistoryReport => ({
  session: { session_id: 'run', quiz_id: 'quiz', session_name: 'Health basics', session_description: null,
    total_score: 40, correct_count: 6, incorrect_count: 4, streak: 6, total_time_ms: 71000, completed_at: null, rank: 5, total_players: 13 },
  answers, topics: summarizeHistoryTopics(answers), feedback: null,
});

test('translates the six user-reported codes into everyday English and Thai', () => {
  const tags = ['adherence', 'risk_factors', 'screening', 'emergency', 'exercise', 'symptom_awareness'];
  assert.deepEqual(tags.map((tag) => learningTopic(tag, 'en')?.title), [
    'Following a care plan', 'What can affect your health', 'Check-ups and early checks',
    'Knowing when to get help', 'Staying active', 'Noticing warning signs',
  ]);
  assert.ok(tags.every((tag) => learningTopic(tag, 'th')?.title));
  assert.equal(learningTopic('#Risk-Factors', 'en')?.title, learningTopic('risk_factors', 'en')?.title);
});

test('does not expose unknown tags or count aliases twice in one answer', () => {
  const areas = personalLearningAreas([
    answer({ id: '1', tags: ['exercise', 'physical_activity', 'exercise'] }),
    answer({ id: '2', tags: ['unknown_specialist_tag'], selectedAligned: false }),
  ], 'en');
  assert.equal(areas.length, 2);
  assert.equal(areas.find((area) => area.title === 'Staying active')?.total, 1);
  assert.equal(areas[1].title, 'Other questions in this quiz');
  assert.equal(learningTopic('unknown_specialist_tag', 'en'), null);
});

test('coaching changes with recorded answers and picks the topic with most missed questions', () => {
  const first = historyCoaching(report([
    answer({ id: 'strong', tags: ['adherence'], selectedAligned: true }),
    answer({ id: 'food', tags: ['nutrition'], selectedAligned: false }),
    answer({ id: 'help1', tags: ['emergency'], selectedAligned: false }),
    answer({ id: 'help2', tags: ['emergency'], selectedAligned: false }),
  ]), 'en');
  assert.equal(first.correct, 1);
  assert.equal(first.total, 4);
  assert.equal(first.strengths[0].title, 'Following a care plan');
  assert.equal(first.nextAnswer?.id, 'help1');
  assert.equal(first.nextArea?.title, 'Knowing when to get help');
  const second = historyCoaching(report([answer({ id: 'food', tags: ['nutrition'], selectedAligned: true })]), 'en');
  assert.equal(second.practice.length, 0);
  assert.equal(second.nextAnswer?.id, 'food');
  assert.equal(second.headline, 'All answers correct');
  assert.notEqual(first.body, second.body);
  assert.doesNotMatch(first.body, /score|rank|streak|accuracy|health risk/i);
});

test('empty coaching does not invent a result or recommend a question', () => {
  const result = historyCoaching(report([]), 'th');
  assert.equal(result.nextAnswer, null);
  assert.equal(result.correct, 0);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.practice, []);
});

test('a mostly correct topic still offers its missed question for review', () => {
  const result = historyCoaching(report([
    answer({ id: '1', tags: ['exercise'] }),
    answer({ id: '2', tags: ['exercise'] }),
    answer({ id: '3', tags: ['exercise'] }),
    answer({ id: '4', tags: ['exercise'], selectedAligned: false }),
  ]), 'en');
  assert.equal(result.strengths.length, 0);
  assert.equal(result.practice[0].title, 'Staying active');
  assert.equal(result.nextAnswer?.id, '4');
});

test('the next topic matches the suggested question when every answer is correct', () => {
  const result = historyCoaching(report([
    answer({ id: 'food', tags: ['nutrition'] }),
    answer({ id: 'move1', tags: ['exercise'] }),
    answer({ id: 'move2', tags: ['exercise'] }),
  ]), 'en');
  assert.equal(result.nextAnswer?.id, 'food');
  assert.equal(result.nextArea?.title, 'Everyday food choices');
});

test('rejects specialist and game language in consumer recaps', () => {
  assert.equal(isEverydayInsight({ headline: 'Start with warning signs', body: 'Let’s look at the question about when to get help.', suggestion: null }), true);
  for (const text of ['risk_factors', 'Clinical adherence', '60% accuracy', 'Your rank is 5', 'Best streak: 6', '#LDL-Targets']) {
    assert.equal(isEverydayInsight({ headline: text, body: 'Review one question.', suggestion: null }), false, text);
  }
});
