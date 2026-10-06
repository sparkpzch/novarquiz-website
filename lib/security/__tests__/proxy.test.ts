import { SESSION_VERSION } from '../session';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../../../proxy';
import { SignJWT } from 'jose';
import { checkRateLimit } from '../../ratelimit';

const environment = ['APP_ORIGIN', 'TRUST_PROXY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const originalEnvironment = environment.map((key) => process.env[key]);
before(() => { for (const key of environment) delete process.env[key]; });
after(() => {
  environment.forEach((key, i) => {
    if (originalEnvironment[i] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[i];
  });
});

test('proxy blocks cross-site writes before API handlers, including login and logout', async () => {
  for (const path of ['/api/auth/session', '/api/quizzes/quiz-1', '/api/account']) {
    const response = await proxy(new NextRequest(`https://quiz.example${path}`, {
      method: 'POST', headers: { origin: 'https://evil.example' },
    }));
    assert.equal(response.status, 403);
  }
});

test('protected routes with asset extensions or public-route prefixes require authentication', async () => {
  for (const path of ['/admin', '/admin/sessions/session.json', '/admin/quizzes/private.png', '/profile.json', '/sign-in-private']) {
    const response = await proxy(new NextRequest(`https://quiz.example${path}`));
    assert.equal(response.status, 307, path);
    assert.match(response.headers.get('location')!, /\/sign-in\?next=/);
  }
});

test('login and logout accept the public App Hosting origin behind a proxy', async () => {
  process.env.APP_ORIGIN = 'https://quiz.example';
  try {
    for (const method of ['POST', 'DELETE']) {
      const response = await proxy(new NextRequest('http://localhost:8080/api/auth/session', {
        method, headers: { origin: 'https://quiz.example', 'sec-fetch-site': 'same-origin' },
      }));
      assert.equal(response.status, 200, method);
      assert.equal(response.headers.get('x-middleware-next'), '1');
    }
    assert.equal((await proxy(new NextRequest('http://localhost:8080/api/auth/session', {
      method: 'DELETE', headers: { origin: 'https://evil.example' },
    }))).status, 403);
  } finally {
    delete process.env.APP_ORIGIN;
  }
});

test('an exhausted login budget cannot prevent logout and CSRF is still blocked', async () => {
  for (let i = 0; i < 10; i++) await checkRateLimit('untrusted', '/api/auth/session', 'ingress');
  assert.equal((await proxy(new NextRequest('https://quiz.example/api/auth/session', {
    method: 'POST', headers: { origin: 'https://quiz.example' },
  }))).status, 429);
  assert.equal((await proxy(new NextRequest('https://quiz.example/api/auth/session', {
    method: 'DELETE', headers: { origin: 'https://quiz.example' },
  }))).status, 200);
  assert.equal((await proxy(new NextRequest('https://quiz.example/api/auth/session', {
    method: 'DELETE', headers: { origin: 'https://evil.example' },
  }))).status, 403);
});

test('legal pages, password reset and known static assets remain publicly accessible', async () => {
  for (const path of ['/terms', '/privacy', '/new-password', '/image/icon/novarquiz-logo.png']) {
    assert.equal((await proxy(new NextRequest(`https://quiz.example${path}`))).status, 200, path);
  }
});

test('verified player sessions cannot open admin pages, and admins land in Quiz Manager', async () => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'proxy-security-test-secret';
  try {
    for (const isAdmin of [false, true]) {
      const token = await new SignJWT({ uid: 'player-1', isAdmin, sessionVersion: SESSION_VERSION })
        .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60s')
        .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
      const adminResponse = await proxy(new NextRequest('https://quiz.example/admin', {
        headers: { cookie: `session=${token}` },
      }));
      assert.equal(adminResponse.status, isAdmin ? 200 : 307);
      if (!isAdmin) assert.equal(adminResponse.headers.get('location'), 'https://quiz.example/');
      const loginResponse = await proxy(new NextRequest('https://quiz.example/sign-in', {
        headers: { cookie: `session=${token}` },
      }));
      assert.equal(loginResponse.headers.get('location'), `https://quiz.example${isAdmin ? '/admin' : '/'}`);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});

test('QR invitations and direct play require a session and preserve the full return URL', async () => {
  for (const path of ['/join/yOSlr1fnBp2d?source=qr', '/play/session/question?mode=solo']) {
    const response = await proxy(new NextRequest(`https://quiz.example${path}`, {
      headers: { authorization: 'Bearer anonymous-token' },
    }));
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get('location')!);
    assert.equal(destination.pathname, '/sign-in');
    assert.equal(destination.searchParams.get('next'), path);
  }
});

test('expired sessions retain the QR destination instead of dropping the invitation', async () => {
  const response = await proxy(new NextRequest('https://quiz.example/join/yOSlr1fnBp2d?source=qr', {
    headers: { cookie: 'session=expired' },
  }));
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('next'), '/join/yOSlr1fnBp2d?source=qr');
  assert.equal(response.cookies.get('session')?.value, '');
});

test('already signed-in players return to the invitation from sign-in', async () => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'invitation-return-test-secret';
  try {
    const token = await new SignJWT({ uid: 'player-1', isAdmin: false, sessionVersion: SESSION_VERSION })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60s')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const response = await proxy(new NextRequest('https://quiz.example/sign-in?next=%2Fjoin%2FyOSlr1fnBp2d', {
      headers: { cookie: `session=${token}` },
    }));
    assert.equal(response.headers.get('location'), 'https://quiz.example/join/yOSlr1fnBp2d');
    assert.equal((await proxy(new NextRequest('https://quiz.example/join/yOSlr1fnBp2d', { headers: { cookie: `session=${token}` } }))).status, 200);
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});
