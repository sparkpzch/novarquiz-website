import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit } from '../../ratelimit';

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
before(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
after(() => {
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

test('rotating session IDs cannot bypass the play API rate limit', async () => {
  for (let i = 0; i < 60; i++) {
    assert.equal((await checkRateLimit('play-attacker', `/api/play/session-${i}/answer`)).allowed, true);
  }
  const blocked = await checkRateLimit('play-attacker', '/api/play/another-session/answer');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
});

test('rotating default-route IDs cannot create unlimited rate-limit buckets', async () => {
  for (let i = 0; i < 100; i++) {
    assert.equal((await checkRateLimit('quiz-attacker', `/api/quizzes/quiz-${i}`)).allowed, true);
  }
  assert.equal((await checkRateLimit('quiz-attacker', '/api/quizzes/another-quiz')).allowed, false);
});

test('arbitrary unknown API namespaces share one capped bucket', async () => {
  for (let i = 0; i < 100; i++) {
    assert.equal((await checkRateLimit('unknown-path-actor', `/api/unknown-${i}/resource`)).allowed, true);
  }
  assert.equal((await checkRateLimit('unknown-path-actor', '/api/another-unknown')).allowed, false);
  assert.equal((await checkRateLimit('unknown-path-actor', '/api/quizzes')).allowed, true);
});

test('one actor exhausting a limit does not block another actor', async () => {
  for (let i = 0; i < 5; i++) await checkRateLimit('uploader-a', '/api/upload');
  assert.equal((await checkRateLimit('uploader-a', '/api/upload')).allowed, false);
  assert.equal((await checkRateLimit('uploader-b', '/api/upload')).allowed, true);
});

test('ingress and handler checks do not halve the login request budget', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await checkRateLimit('login-actor', '/api/auth/session', 'ingress')).allowed, true);
    assert.equal((await checkRateLimit('login-actor', '/api/auth/session')).allowed, true);
  }
  assert.equal((await checkRateLimit('login-actor', '/api/auth/session', 'ingress')).allowed, false);
  assert.equal((await checkRateLimit('login-actor', '/api/auth/session')).allowed, false);
});

test('play operations retain separate budgets and trailing slashes cannot reset them', async () => {
  for (let i = 0; i < 60; i++) await checkRateLimit('operation-actor', `/api/play/session-${i}/answer/`);
  assert.equal((await checkRateLimit('operation-actor', '/api/play/session/answer')).allowed, false);
  assert.equal((await checkRateLimit('operation-actor', '/api/play/session/leaderboard')).allowed, true);
});

test('admin draft generation retains its stricter limit across suffix variations', async () => {
  for (let i = 0; i < 5; i++) await checkRateLimit('draft-actor', `/api/admin/insight-templates/draft/${i}`);
  assert.equal((await checkRateLimit('draft-actor', '/api/admin/insight-templates/draft')).allowed, false);
  assert.equal((await checkRateLimit('draft-actor', '/api/admin/sessions/session/analytics')).allowed, true);
});

test('a fixed window resets exactly at its expiry boundary', async () => {
  const realNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 5; i++) await checkRateLimit('window-actor', '/api/upload');
    assert.equal((await checkRateLimit('window-actor', '/api/upload')).allowed, false);
    now += 60_000;
    assert.equal((await checkRateLimit('window-actor', '/api/upload')).allowed, true);
  } finally {
    Date.now = realNow;
  }
});
