import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../../../proxy';
import { SignJWT } from 'jose';

test('proxy blocks cross-site writes before API handlers, including login and logout', async () => {
  for (const path of ['/api/auth/session', '/api/quizzes/quiz-1', '/api/account']) {
    const response = await proxy(new NextRequest(`https://quiz.example${path}`, {
      method: 'POST', headers: { origin: 'https://evil.example' },
    }));
    assert.equal(response.status, 403);
  }
});

test('protected routes with asset extensions or public-route prefixes require authentication', async () => {
  for (const path of ['/admin/sessions/session.json', '/admin/quizzes/private.png', '/profile.json', '/sign-in-private']) {
    const response = await proxy(new NextRequest(`https://quiz.example${path}`));
    assert.equal(response.status, 307, path);
    assert.match(response.headers.get('location')!, /\/sign-in\?next=/);
  }
});

test('legal pages, password reset and known static assets remain publicly accessible', async () => {
  for (const path of ['/terms', '/privacy', '/new-password', '/image/icon/novartis-logo-transparent.png']) {
    assert.equal((await proxy(new NextRequest(`https://quiz.example${path}`))).status, 200, path);
  }
});

test('verified player sessions cannot open admin pages, and admins land in Quiz Manager', async () => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'proxy-security-test-secret';
  try {
    for (const isAdmin of [false, true]) {
      const token = await new SignJWT({ uid: 'player-1', isAdmin })
        .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60s')
        .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
      const adminResponse = await proxy(new NextRequest('https://quiz.example/admin', {
        headers: { cookie: `session=${token}` },
      }));
      assert.equal(adminResponse.status, isAdmin ? 200 : 307);
      if (!isAdmin) assert.equal(adminResponse.headers.get('location'), 'https://quiz.example/quizzes');
      const loginResponse = await proxy(new NextRequest('https://quiz.example/sign-in', {
        headers: { cookie: `session=${token}` },
      }));
      assert.equal(loginResponse.headers.get('location'), `https://quiz.example${isAdmin ? '/admin' : '/quizzes'}`);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});
