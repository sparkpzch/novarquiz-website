import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedMutation } from '../request-origin';

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
