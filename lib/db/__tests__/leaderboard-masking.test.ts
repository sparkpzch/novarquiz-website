// Run with: npx tsx --test lib/db/__tests__/leaderboard-masking.test.ts
//
// Guards the privacy contract for the public leaderboard routes
// (app/api/play/[sessionId]/leaderboard, app/api/sessions/[sessionId]/leaderboard).
// These pure functions are what getLeaderboard() composes, so testing them here
// covers the route output without needing a live Postgres pool.

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-for-masking';

import { maskLeaderboardEntry, toPublicLeaderboardEntry } from '../schema';

// Mirrors the getLeaderboard() pipeline exactly.
function publicLeaderboard(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => maskLeaderboardEntry(row))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map(toPublicLeaderboardEntry);
}

function pseudonymousRow(userId: string) {
  return {
    session_id: 's1',
    user_id: userId,
    user_display_name: 'Dr. Jane Doe',
    user_photo_url: 'https://example.com/jane.jpg',
    total_score: 90,
    correct_count: 9,
    streak: 3,
    profile_vector_scores: { GuidelineAdherence: 0.8 },
    normalized_vector_scores: { GuidelineAdherence: 0.9 },
    archetype_id: 'innovator',
    insight_classification: 'pseudonymous' as const,
  };
}

test('drops aggregate-classified rows entirely', () => {
  const out = publicLeaderboard([
    { ...pseudonymousRow('uid-keep'), insight_classification: 'aggregate' },
  ]);
  assert.equal(out.length, 0);
});

test('pseudonymous: masks name, nulls photo, never returns raw user_id', () => {
  const [row] = publicLeaderboard([pseudonymousRow('firebase-uid-12345')]);
  assert.equal(row.user_display_name, 'HCP Participant');
  assert.equal(row.user_photo_url, null);
  assert.notEqual(row.user_id, 'firebase-uid-12345');
  // total_score etc. survive — pseudonymous keeps behavioural/score data.
  assert.equal(row.total_score, 90);
  assert.equal(row.correct_count, 9);
});

test('pseudonymous: distinct user_ids yield distinct pseudo-ids (field-bug guard)', () => {
  const [a] = publicLeaderboard([pseudonymousRow('user-aaa')]);
  const [b] = publicLeaderboard([pseudonymousRow('user-bbb')]);
  assert.notEqual(a.user_id, b.user_id);
});

test('no HCP profiling columns leave the public boundary (any classification)', () => {
  const out = publicLeaderboard([
    pseudonymousRow('user-1'),
    { ...pseudonymousRow('user-2'), insight_classification: 'identified', user_display_name: 'Dr. Consented' },
  ]);
  assert.equal(out.length, 2);
  for (const row of out) {
    assert.ok(!('profile_vector_scores' in row), 'profile_vector_scores leaked');
    assert.ok(!('normalized_vector_scores' in row), 'normalized_vector_scores leaked');
    assert.ok(!('archetype_id' in row), 'archetype_id leaked');
    assert.ok(!('insight_classification' in row), 'insight_classification leaked');
  }
});

test('identified rows keep their real display name but still drop HCP cols', () => {
  const [row] = publicLeaderboard([
    { ...pseudonymousRow('user-x'), insight_classification: 'identified', user_display_name: 'Dr. Consented' },
  ]);
  assert.equal(row.user_display_name, 'Dr. Consented');
  assert.ok(!('archetype_id' in row));
});
