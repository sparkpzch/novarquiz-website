import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeCurrentSession, idTokenSessionContext } from '../live-session';

const session = { uid: 'player', isAdmin: true, expiresAt: 9999999999, authTime: 1000, userSessionVersion: '0' };
const account = { disabled: false, customClaims: { admin: true }, tokensValidAfterTime: new Date(900_000).toISOString() };

test('current role is checked even while the signed admin JWT has not expired', () => {
  assert.equal(authorizeCurrentSession(session, account).isAdmin, true);
  assert.equal(authorizeCurrentSession(session, { ...account, customClaims: { admin: false } }).isAdmin, false);
  assert.equal(authorizeCurrentSession({ ...session, isAdmin: false }, account).isAdmin, false);
});
test('disabled, deleted/unavailable, revoked and version-bumped accounts cannot keep using old app cookies', () => {
  assert.throws(() => authorizeCurrentSession(session, { ...account, disabled: true }), /disabled/);
  assert.throws(() => authorizeCurrentSession(session, { ...account, tokensValidAfterTime: new Date(1_001_000).toISOString() }), /revoked/);
  assert.throws(() => authorizeCurrentSession(session, { ...account, customClaims: { admin: true, applicationSessionVersion: 'new' } }), /version revoked/);
  assert.throws(() => authorizeCurrentSession(session, { ...account, tokensValidAfterTime: 'invalid' }), /revoked/);
});
test('a custom token obtained before revocation cannot create a fresh app session afterwards', () => {
  const custom = { auth_time: 2000, firebase: { sign_in_provider: 'custom' }, applicationAuthTime: 1000, applicationSessionVersion: '0' };
  assert.equal(idTokenSessionContext(custom, account).authTime, 1000);
  assert.throws(() => idTokenSessionContext(custom, { ...account, tokensValidAfterTime: new Date(1_001_000).toISOString() }), /revoked/);
  assert.throws(() => idTokenSessionContext({ auth_time: 2000, firebase: { sign_in_provider: 'custom' } }, account), /context/);
});
test('fresh password/OAuth sign-in adopts the current per-account version and validates revocation', () => {
  const current = { ...account, customClaims: { applicationSessionVersion: 'new' } };
  assert.throws(() => idTokenSessionContext({auth_time:1000,firebase:{sign_in_provider:'password'}},current),/version revoked/);
  assert.deepEqual(idTokenSessionContext({auth_time:1000,applicationSessionVersion:'new',firebase:{sign_in_provider:'password'}}, current), {authTime:1000,userSessionVersion:'new'});
});
