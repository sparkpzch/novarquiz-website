// Run with: npx tsx --test lib/stats/__tests__/health.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayStreak, knowledgeLevel, summarizeHealthStats } from '../health';

const base = { answerDays: [], today: '2026-09-17', completedQuizzes: 0, publishedQuizzes: 0 };

test('empty input yields zeroed stats and no weakest topic', () => {
  const s = summarizeHealthStats({ ...base, topics: [] });
  assert.equal(s.knowledgeScore, 0);
  assert.equal(s.accuracy, 0);
  assert.equal(s.progress, 0);
  assert.equal(s.answered, 0);
  assert.equal(s.weakestTopic, null);
  assert.deepEqual(s.topics, []);
});

test('knowledge score averages topics equally; accuracy weighs answers', () => {
  const s = summarizeHealthStats({
    ...base,
    topics: [
      { quiz_id: 'a', quiz_name: 'Heart', answered: 10, positive: 9 }, // 90
      { quiz_id: 'b', quiz_name: 'Sleep', answered: 2, positive: 1 }, // 50
    ],
  });
  assert.equal(s.knowledgeScore, 70);
  assert.equal(s.accuracy, 83); // 10 / 12
  assert.equal(s.answered, 12);
  assert.equal(s.level, 'good');
  assert.deepEqual(s.topics.map((t) => t.name), ['Heart', 'Sleep']);
  assert.equal(s.weakestTopic?.quiz_id, 'b');
});

test('topics with no answers are ignored', () => {
  const s = summarizeHealthStats({
    ...base,
    topics: [
      { quiz_id: 'a', quiz_name: 'Heart', answered: 4, positive: 4 },
      { quiz_id: 'b', quiz_name: 'Empty', answered: 0, positive: 0 },
    ],
  });
  assert.equal(s.topics.length, 1);
  assert.equal(s.knowledgeScore, 100);
  assert.equal(s.weakestTopic?.quiz_id, 'a');
});

test('progress is completed / published, capped at 100', () => {
  assert.equal(summarizeHealthStats({ ...base, topics: [], completedQuizzes: 3, publishedQuizzes: 5 }).progress, 60);
  assert.equal(summarizeHealthStats({ ...base, topics: [], completedQuizzes: 4, publishedQuizzes: 2 }).progress, 100);
});

test('knowledgeLevel thresholds', () => {
  assert.equal(knowledgeLevel(80), 'excellent');
  assert.equal(knowledgeLevel(79), 'good');
  assert.equal(knowledgeLevel(60), 'good');
  assert.equal(knowledgeLevel(40), 'fair');
  assert.equal(knowledgeLevel(39), 'needs_work');
});

test('dayStreak counts back from today or yesterday', () => {
  assert.equal(dayStreak(['2026-09-17', '2026-09-16', '2026-09-15', '2026-09-13'], '2026-09-17'), 3);
  assert.equal(dayStreak(['2026-09-16', '2026-09-15'], '2026-09-17'), 2);
  assert.equal(dayStreak(['2026-09-15'], '2026-09-17'), 0);
  assert.equal(dayStreak(['2026-09-01', '2026-08-31'], '2026-09-01'), 2); // month boundary
  assert.equal(dayStreak([], '2026-09-17'), 0);
});
