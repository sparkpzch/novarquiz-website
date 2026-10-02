import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { verifySessionToken, SESSION_VERSION } from '../session';

const originalSecret = process.env.SESSION_SECRET;
const secret = new TextEncoder().encode('session-security-test-secret');
before(() => { process.env.SESSION_SECRET = 'session-security-test-secret'; });
after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

async function token(claims: Record<string, unknown> = {}, alg = 'HS256') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid: 'player-1', isAdmin: false, sessionVersion: SESSION_VERSION, iat: now, exp: now + 60, ...claims })
    .setProtectedHeader({ alg }).sign(secret);
}

test('valid player and admin sessions verify with explicit role types', async () => {
  assert.equal((await verifySessionToken(await token())).isAdmin, false);
  assert.equal((await verifySessionToken(await token({ isAdmin: true }))).isAdmin, true);
});

test('sessions reject malformed identities, truthy role claims and missing expiry', async () => {
  for (const claims of [{ uid: '' }, { uid: ' ' }, { uid: 42 }, { isAdmin: 'false' }, { isAdmin: 1 }, { isAdmin: null }, { exp: undefined }, { iat: undefined }, { iat: Math.floor(Date.now() / 1000) + 120 }]) {
    await assert.rejects(verifySessionToken(await token(claims)), JSON.stringify(claims));
  }
});

test('expired, tampered, unsigned and unexpected-algorithm sessions fail', async () => {
  await assert.rejects(verifySessionToken(await token({ exp: 1 })));
  await assert.rejects(verifySessionToken(await token({}, 'HS384')));
  const valid = await token();
  const parts = valid.split('.');
  parts[1] = Buffer.from(JSON.stringify({ uid: 'attacker', isAdmin: true })).toString('base64url');
  await assert.rejects(verifySessionToken(parts.join('.')));
  await assert.rejects(verifySessionToken('eyJhbGciOiJub25lIn0.eyJ1aWQiOiJhZG1pbiJ9.'));
});

test('rollout rejects every older player and admin session', async () => {
  for (const isAdmin of [false, true]) {
    await assert.rejects(verifySessionToken(await token({ isAdmin, sessionVersion: undefined })));
    await assert.rejects(verifySessionToken(await token({ isAdmin, sessionVersion: 'older-rollout' })));
  }
});
