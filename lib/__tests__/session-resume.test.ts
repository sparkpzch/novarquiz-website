import assert from 'node:assert/strict';
import test from 'node:test';
import { canResumeRoom, canResumeSession, hasRecentSessionPresence, SESSION_PRESENCE_TTL_MS, SESSION_RESUME_TTL_MS } from '../session-resume';

test('resume expires exactly five minutes after the latest exit', () => {
  const entry = { joinedAt: 1000, lastInteractionAt: 2000, lastLeftAt: 5000 };
  assert.equal(canResumeSession(entry, 5000 + SESSION_RESUME_TTL_MS - 1), true);
  assert.equal(canResumeSession(entry, 5000 + SESSION_RESUME_TTL_MS), false);
  assert.equal(canResumeSession({ ...entry, lastLeftAt: 10000 }, 5000 + SESSION_RESUME_TTL_MS), true);
});

test('online heartbeats cannot extend the AFK resume window', () => {
  const now = 1000 + SESSION_RESUME_TTL_MS;
  assert.equal(canResumeSession({ joinedAt: 1000, lastInteractionAt: 1000, lastActiveAt: now }, now), false);
  assert.equal(canResumeSession({ joinedAt: 1000, lastInteractionAt: now, lastActiveAt: now }, now), true);
});

test('resume supports older entries and rejects invalid timestamps', () => {
  assert.equal(canResumeSession({ joinedAt: 1000 }, 1000 + SESSION_RESUME_TTL_MS), false);
  assert.equal(canResumeSession({ joinedAt: 1000, lastActiveAt: 2000 }, 2001), true);
  assert.equal(canResumeSession({ joinedAt: NaN }, 1000), false);
  assert.equal(canResumeSession({ joinedAt: 100000 }, 1000), false);
});

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
