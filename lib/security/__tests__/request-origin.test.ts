import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedMutation } from '../request-origin';

const originalOrigin = process.env.APP_ORIGIN;
before(() => { delete process.env.APP_ORIGIN; });
after(() => {
  if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalOrigin;
});

function request(method: string, headers: Record<string, string> = {}) {
  return new Request('https://quiz.example/api/auth/session', { method, headers });
}

test('same-origin mutations and read-only methods are allowed', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(isTrustedMutation(request(method, { origin: 'https://quiz.example' })), true);
    assert.equal(isTrustedMutation(request(method, { referer: 'https://quiz.example/admin' })), true);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(isTrustedMutation(request(method)), true);
  }
});

test('cross-site, sibling-site, opaque and malformed origins cannot mutate', () => {
  for (const origin of ['https://evil.example', 'https://other.quiz.example', 'http://quiz.example', 'https://quiz.example:444', 'null', 'https://quiz.example.evil.test', 'https://quiz.example/path', 'https://user@quiz.example', 'invalid']) {
    assert.equal(isTrustedMutation(request('POST', { origin })), false, origin);
  }
  assert.equal(isTrustedMutation(request('POST')), false);
  assert.equal(isTrustedMutation(request('POST', { origin: 'https://evil.example', referer: 'https://quiz.example/' })), false);
  assert.equal(isTrustedMutation(request('POST', { origin: 'https://quiz.example', 'sec-fetch-site': 'cross-site' })), false);
});

test('App Hosting accepts its configured public origin behind an internal URL', () => {
  process.env.APP_ORIGIN = 'https://quiz.example';
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const sources: Record<string, string>[] = [{ origin: 'https://quiz.example' }, { referer: 'https://quiz.example/admin' }];
      for (const headers of sources) {
        assert.equal(isTrustedMutation(new Request('http://localhost:8080/api/auth/session', { method, headers })), true);
      }
    }
    for (const origin of ['https://evil.example', 'https://other.quiz.example', 'http://localhost:8080', 'http://quiz.example', 'https://quiz.example:444']) {
      assert.equal(isTrustedMutation(new Request('http://localhost:8080/api/auth/session', {
        method: 'POST', headers: { origin, 'x-forwarded-host': 'quiz.example', 'x-forwarded-proto': 'https' },
      })), false, origin);
    }
  } finally {
    delete process.env.APP_ORIGIN;
  }
});

test('forwarded host headers cannot establish a trusted origin', () => {
  assert.equal(isTrustedMutation(request('POST', {
    origin: 'https://evil.example', host: 'evil.example',
    'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
  })), false);
});

test('invalid configured origins fail closed', () => {
  try {
    for (const value of ['invalid', 'https://quiz.example/', 'https://quiz.example/path', 'https://user@quiz.example']) {
      process.env.APP_ORIGIN = value;
      assert.equal(isTrustedMutation(request('POST', { origin: 'https://quiz.example' })), false, value);
    }
  } finally {
    delete process.env.APP_ORIGIN;
  }
});
