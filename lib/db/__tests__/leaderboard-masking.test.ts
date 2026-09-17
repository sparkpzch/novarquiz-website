// Run with: npx tsx --test lib/db/__tests__/leaderboard-masking.test.ts
//
// Guards the privacy contract for the public leaderboard routes
// (app/api/play/[sessionId]/leaderboard, app/api/sessions/[sessionId]/leaderboard).
// These pure functions are what getLeaderboard() composes, so testing them here
// covers the route output without needing a live Postgres pool.

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-for-masking';

import { maskLeaderboardEntry, maskPublicLeaderboardEntry, toPublicLeaderboardEntry } from '../schema';

// Mirrors the getLeaderboard() pipeline exactly.
function publicLeaderboard(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => maskPublicLeaderboardEntry(row))
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

test('aggregate rows stay on the public board with name and photo, but no raw uid', () => {
  const [row] = publicLeaderboard([
    { ...pseudonymousRow('uid-keep'), insight_classification: 'aggregate' },
  ]);
  assert.equal(row.user_display_name, 'Dr. Jane Doe');
  assert.equal(row.user_photo_url, 'https://example.com/jane.jpg');
  assert.notEqual(row.user_id, 'uid-keep');
  assert.equal(row.total_score, 90);
  assert.ok(!('insight_classification' in row));
});

test('rows without a classification keep their name but not their raw uid', () => {
  const unclassified: Record<string, unknown> = pseudonymousRow('uid-none');
  delete unclassified.insight_classification;
  const [row] = publicLeaderboard([unclassified]);
  assert.equal(row.user_display_name, 'Dr. Jane Doe');
  assert.notEqual(row.user_id, 'uid-none');
});

test('admin masker still drops aggregate rows', () => {
  assert.equal(
    maskLeaderboardEntry({ ...pseudonymousRow('uid-x'), insight_classification: 'aggregate' }),
    null,
  );
});

test('pseudonymous: keeps name and photo, never returns raw user_id', () => {
  const [row] = publicLeaderboard([pseudonymousRow('firebase-uid-12345')]);
  assert.equal(row.user_display_name, 'Dr. Jane Doe');
  assert.equal(row.user_photo_url, 'https://example.com/jane.jpg');
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

test('is_me survives masking so the viewer can find their anonymized row', () => {
  const out = publicLeaderboard([
    { ...pseudonymousRow('viewer'), insight_classification: 'aggregate', is_me: true },
    { ...pseudonymousRow('other'), insight_classification: 'aggregate', is_me: false },
  ]);
  assert.equal(out[0].is_me, true);
  assert.equal(out[1].is_me, false);
  assert.notEqual(out[0].user_id, 'viewer');
});
