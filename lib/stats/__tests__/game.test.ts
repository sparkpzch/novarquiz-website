import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGameStats } from '../game';

const run = (score: number, rank = 3) => ({ total_score: score, correct_count: 1, incorrect_count: 2, streak: 1, rank });

test('personal best starts at zero when every completed run has penalties', () => {
  const history = [run(-5), run(-12)];
  const summary = summarizeGameStats(history);
  assert.equal(summary.bestScore, 0);
  assert.equal(summary.avgScore, -8);
  assert.equal(summary.totalPlayed, 2);
  assert.equal(history[0].total_score, -5);
});

test('positive personal best and rank are preserved across mixed results', () => {
  const summary = summarizeGameStats([run(-5), run(25, 1), run(8, 2)]);
  assert.equal(summary.bestScore, 25);
  assert.equal(summary.bestStreak, 1);
  assert.equal(summary.topRank, 1);
});

test('no completed quizzes gives a zero personal best', () => {
  assert.equal(summarizeGameStats([]).bestScore, 0);
});
