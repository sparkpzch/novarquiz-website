import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReturnPath, authHref } from '../auth-return';

test('QR destination and query parameters survive sign-in and sign-up navigation', () => {
  const target = '/join/yOSlr1fnBp2d?source=qr';
  assert.equal(authReturnPath(target), target);
  for (const route of ['/sign-in', '/sign-up']) {
    const url = new URL(authHref(route, target), 'https://quiz.example');
    assert.equal(url.pathname, route);
    assert.equal(url.searchParams.get('next'), target);
  }
});
test('missing query parameters can use the stored invitation, while external paths and auth loops cannot', () => {
  assert.equal(authReturnPath(null, '/join/saved'), '/join/saved');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/sign-in?next=/join/test', '/sign-up']) {
    assert.equal(authReturnPath(value), '/');
  }
});
