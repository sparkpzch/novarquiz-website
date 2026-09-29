// Run with: npx tsx --test lib/stats/__tests__/health.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayStreak, knowledgeLevel, summarizeHealthStats } from '../health';

const base = {
  topicBreakdownRows: [],
  answerDays: [],
  today: '2026-09-17',
  completedQuizzes: 0,
  publishedQuizzes: 0,
  profileVectors: [],
  gapTagRows: [],
};

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
      { quiz_id: 'a', quiz_name: 'Heart', answered: 10, positive: 9, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' }, // 90
      { quiz_id: 'b', quiz_name: 'Sleep', answered: 2, positive: 1, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' }, // 50
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
      { quiz_id: 'a', quiz_name: 'Heart', answered: 4, positive: 4, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' },
      { quiz_id: 'b', quiz_name: 'Empty', answered: 0, positive: 0, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' },
    ],
  });
  assert.equal(s.topics.length, 1);
  assert.equal(s.knowledgeScore, 100);
  assert.equal(s.weakestTopic?.quiz_id, 'a');
});

test('topic breakdown percentages use earned utility over maximum and preserve answer counts', () => {
  const s = summarizeHealthStats({
    ...base,
    topics: [],
    topicBreakdownRows: [
      { tag: '#Cardio', earned_utility: 7, max_utility: 10, responses: 3, question_count: 3 },
      { tag: '#Nutrition', earned_utility: 12, max_utility: 10, responses: 2, question_count: 2 },
      { tag: '#NoMax', earned_utility: -2, max_utility: 0, responses: 1, question_count: 1 },
    ],
  });
  assert.deepEqual(s.topicBreakdown.map(({ tag, percentage, earnedUtility, maxUtility, responses }) => ({
    tag, percentage, earnedUtility, maxUtility, responses,
  })), [
    { tag: '#NoMax', percentage: null, earnedUtility: -2, maxUtility: 0, responses: 1 },
    { tag: '#Cardio', percentage: 70, earnedUtility: 7, maxUtility: 10, responses: 3 },
    { tag: '#Nutrition', percentage: 100, earnedUtility: 12, maxUtility: 10, responses: 2 },
  ]);
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

test('archetype stays null without profiling vectors', () => {
  assert.equal(summarizeHealthStats({ ...base, topics: [] }).archetype, null);
  // An opted-out player still has a row, just an empty vector — classifying it
  // would label them from no evidence at all.
  assert.equal(summarizeHealthStats({ ...base, topics: [], profileVectors: [{}] }).archetype, null);
  assert.equal(
    summarizeHealthStats({ ...base, topics: [], profileVectors: [{ guideline_adherence: 0 }] }).archetype,
    null,
  );
});

test('archetype sums raw vectors across quizzes before classifying', () => {
  // 1.2 + 1.0 = 2.2 raw -> 22 normalized, over the 20 threshold; neither
  // quiz would reach it alone.
  const s = summarizeHealthStats({
    ...base,
    topics: [],
    profileVectors: [
      { guideline_adherence: 1.2, innovation_adoption: -0.5 },
      { guideline_adherence: 1.0, innovation_adoption: -0.3 },
    ],
  });
  assert.equal(s.archetype, 'conservative_guideline_follower');
});

test('gap tags come from the most recently answered quiz only', () => {
  const s = summarizeHealthStats({
    ...base,
    topics: [
      { quiz_id: 'old', quiz_name: 'Diet', answered: 4, positive: 1, audience: 'public' as const, last_answered_at: '2026-09-10T08:00:00Z' },
      { quiz_id: 'new', quiz_name: 'Heart', answered: 4, positive: 3, audience: 'public' as const, last_answered_at: '2026-09-17T09:00:00Z' },
    ],
    gapTagRows: [
      { quiz_id: 'old', tag: 'diet' },
      { quiz_id: 'new', tag: 'screening' },
      { quiz_id: 'new', tag: 'adherence' },
    ],
  });
  assert.equal(s.latestTopic?.quiz_id, 'new');
  assert.deepEqual(s.gapTags, ['screening', 'adherence']);
  // The weakest quiz is still the older one — the two must not be conflated.
  assert.equal(s.weakestTopic?.quiz_id, 'old');
});

test('latestTopic is null when nothing has been answered', () => {
  const s = summarizeHealthStats({ ...base, topics: [] });
  assert.equal(s.latestTopic, null);
  assert.deepEqual(s.gapTags, []);
});

test('solidTopics counts topics at or above the threshold', () => {
  const s = summarizeHealthStats({
    ...base,
    topics: [
      { quiz_id: 'a', quiz_name: 'Heart', answered: 10, positive: 10, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' }, // 100
      { quiz_id: 'b', quiz_name: 'Diet', answered: 10, positive: 8, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' }, // 80 — inclusive
      { quiz_id: 'c', quiz_name: 'Sleep', answered: 10, positive: 7, audience: 'public' as const, last_answered_at: '2026-09-17T10:00:00Z' }, // 79
    ],
  });
  assert.equal(s.solidTopics, 2);
  assert.equal(s.topics.length, 3);
});
