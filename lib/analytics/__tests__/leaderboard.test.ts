import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatQuizTime, rankLeaderboard } from '../leaderboard';
import type { LeaderboardEntry } from '../../types';

const entry = (id: string, score: number, time: number, mine = false): LeaderboardEntry => ({
  id, session_id: 'quiz', user_id: `public-${id}`, user_display_name: id, user_photo_url: null,
  total_score: score, total_time_ms: time, correct_count: 1, incorrect_count: 0,
  unanswered_count: 0, streak: 1, completed_at: '2026-10-02', is_me: mine,
});

test('standings rank completed scores before time and retain viewer identification', () => {
  const entries = [entry('slower', 20, 30000), entry('mine', 20, 15000, true), entry('winner', 30, 50000), entry('fast', 10, 1000)];
  const ranked = rankLeaderboard(entries);
  assert.deepEqual(ranked.map((row) => row.id), ['winner', 'mine', 'slower', 'fast']);
  assert.equal(ranked.findIndex((row) => row.is_me), 1);
  assert.equal(ranked[1].user_id, 'public-mine', 'Use the API viewer flag even when the public ID differs from Firebase UID');
  assert.deepEqual(entries.map((row) => row.id), ['slower', 'mine', 'winner', 'fast'], 'Ranking must not mutate source results');
});

test('tied scores and times produce stable ranks, including negative points', () => {
  const a = entry('a', -5, 1000), b = entry('b', -5, 1000), c = entry('c', 0, 2000);
  assert.deepEqual(rankLeaderboard([b, a, c]).map((row) => row.id), ['c', 'a', 'b']);
  assert.deepEqual(rankLeaderboard([]), []);
});

test('quiz time retains minutes beyond one hour and clamps negative values', () => {
  assert.equal(formatQuizTime(0), '0:00');
  assert.equal(formatQuizTime(59999), '0:59');
  assert.equal(formatQuizTime(61400), '1:01');
  assert.equal(formatQuizTime(3661000), '61:01');
  assert.equal(formatQuizTime(-1000), '0:00');
});
