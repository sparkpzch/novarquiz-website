import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endClientSession } from '../logout';

test('logout waits for server cookie deletion before signing out of Firebase', async () => {
  const events: string[] = [];
  let finishDelete!: (response: Response) => void;
  const deletion = new Promise<Response>((resolve) => { finishDelete = resolve; });
  const logout = endClientSession(
    () => { events.push('delete'); return deletion; },
    async () => { events.push('firebase'); },
  );
  assert.deepEqual(events, ['delete']);
  finishDelete(new Response('{}', { status: 200 }));
  await logout;
  assert.deepEqual(events, ['delete', 'firebase']);
});

test('403, 429 and server errors cannot produce a false successful logout', async () => {
  for (const status of [403, 429, 500]) {
    let signedOut = false;
    await assert.rejects(endClientSession(
      async () => new Response('{}', { status }),
      async () => { signedOut = true; },
    ), /Server sign-out failed/);
    assert.equal(signedOut, false, String(status));
  }
});

test('network and Firebase failures propagate so the UI can offer retry', async () => {
  let signedOut = false;
  await assert.rejects(endClientSession(
    async () => { throw new Error('Network unavailable'); },
    async () => { signedOut = true; },
  ), /Network unavailable/);
  assert.equal(signedOut, false);
  await assert.rejects(endClientSession(
    async () => new Response('{}'),
    async () => { throw new Error('Firebase sign-out failed'); },
  ), /Firebase sign-out failed/);
});
