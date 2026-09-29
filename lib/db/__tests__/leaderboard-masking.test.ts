// Run with: npx tsx --test lib/db/__tests__/leaderboard-masking.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-for-masking';

import { maskLeaderboardEntry, maskPublicLeaderboardEntry, toPublicLeaderboardEntry } from '../schema';

function publicLeaderboard(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => maskPublicLeaderboardEntry(row))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map((row) => toPublicLeaderboardEntry(row));
}

function row(userId: string) {
  return {
    session_id: 's1',
    user_id: userId,
    user_display_name: 'Player Name',
    user_photo_url: 'https://example.com/player.jpg',
    total_score: 90,
    correct_count: 9,
    streak: 3,
  };
}

test('public masking is independent of the retired profiling classification', () => {
  const [publicRow, legacyRow] = publicLeaderboard([
    { ...row('uid-public'), insight_classification: 'aggregate' },
    { ...row('uid-legacy'), insight_classification: 'identified', user_display_name: 'Named Player' },
  ]);
  assert.equal(publicRow.user_display_name, 'Player Name');
  assert.equal(publicRow.user_photo_url, 'https://example.com/player.jpg');
  assert.notEqual(publicRow.user_id, 'uid-public');
  assert.equal(publicRow.total_score, 90);
  assert.equal(legacyRow.user_display_name, 'Named Player');
  assert.notEqual(legacyRow.user_id, 'uid-legacy');
});

test('direct admin masker pseudonymizes identifiers consistently', () => {
  const first = maskLeaderboardEntry(row('same-uid'));
  const second = maskLeaderboardEntry(row('same-uid'));
  assert.equal(first.user_id, second.user_id);
  assert.notEqual(first.user_id, 'same-uid');
  assert.equal(first.user_display_name, 'Participant');
  assert.equal(first.user_photo_url, null);
});

test('different players receive different pseudo-ids', () => {
  assert.notEqual(maskLeaderboardEntry(row('user-a')).user_id, maskLeaderboardEntry(row('user-b')).user_id);
});

test('retired profile columns are stripped from the public boundary', () => {
  const [result] = publicLeaderboard([{
    ...row('uid-x'),
    profile_vector_scores: { old: 1 },
    normalized_vector_scores: { old: 1 },
    archetype_id: 'legacy',
    insight_classification: 'identified',
  }]);
  for (const field of ['profile_vector_scores', 'normalized_vector_scores', 'archetype_id', 'insight_classification']) {
    assert.ok(!(field in result), `${field} leaked`);
  }
});

test('viewer flag survives pseudonymization', () => {
  const [mine, other] = publicLeaderboard([
    { ...row('viewer'), is_me: true },
    { ...row('other'), is_me: false },
  ]);
  assert.equal(mine.is_me, true);
  assert.equal(other.is_me, false);
  assert.notEqual(mine.user_id, 'viewer');
});

// Legacy profile keys are removed even when the caller bypasses the public mask.
test('public serializer omits legacy profile fields', () => {
  const result = toPublicLeaderboardEntry({ ...row('uid'), archetype_id: 'legacy' });
  assert.ok(!('archetype_id' in result));
});
