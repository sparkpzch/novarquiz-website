import assert from 'node:assert/strict';
import test from 'node:test';
import { canResumeRoom, hasRecentSessionPresence, SESSION_PRESENCE_TTL_MS } from '../session-resume';

test('old server-created index entries expire even if their room was never closed', () => {
  assert.equal(hasRecentSessionPresence({ joinedAt: 1000 }, 1000 + SESSION_PRESENCE_TTL_MS), false);
  assert.equal(hasRecentSessionPresence({ joinedAt: 1000, lastActiveAt: 100000 }, 100001), true);
  assert.equal(hasRecentSessionPresence({ joinedAt: NaN }, 100001), false);
});

test('deleted, ended, empty and completed rooms cannot be resumed', () => {
  assert.equal(canResumeRoom(null, 'player'), false);
  assert.equal(canResumeRoom({ status: 'ended', players: { player: {} } }, 'player'), false);
  assert.equal(canResumeRoom({ status: 'started', players: {} }, 'player'), false);
  assert.equal(canResumeRoom({ status: 'started', players: { other: {} } }, 'player'), false);
  assert.equal(canResumeRoom({ status: 'started', players: { player: {} }, scores: { player: { finished: true } } }, 'player'), false);
});

test('a member can resume waiting or unfinished started rooms', () => {
  assert.equal(canResumeRoom({ status: 'waiting', players: { player: {} } }, 'player'), true);
  assert.equal(canResumeRoom({ status: 'started', players: { player: {} }, scores: { player: { finished: false } } }, 'player'), true);
});
