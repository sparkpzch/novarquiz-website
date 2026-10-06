import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLivePlayerIdentity } from '../player-identity';

test('legacy Player score entries use the name and avatar from the waiting room', () => {
  assert.deepEqual(resolveLivePlayerIdentity({ displayName: 'Player' }, { displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' }), { displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' });
});
test('the current user sees their actual Auth identity, including intentional photo removal', () => {
  assert.deepEqual(resolveLivePlayerIdentity({ displayName: 'Player', photoURL: 'https://example.com/old.jpg' }, { displayName: 'Old name', photoURL: 'https://example.com/room.jpg' }, { displayName: 'New name', photoURL: null }), { displayName: 'New name', photoURL: null });
});
test('players who have left the waiting room keep their score identity', () => {
  assert.deepEqual(resolveLivePlayerIdentity({ displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' }), { displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' });
});
test('a name-only room update does not discard a score avatar', () => {
  assert.deepEqual(resolveLivePlayerIdentity({ displayName: 'Player', photoURL: 'https://example.com/jane.jpg' }, { displayName: 'Jane' }), { displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' });
});

test('old room placeholders and missing photos do not hide repaired score profiles', () => {
  assert.deepEqual(resolveLivePlayerIdentity({ displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' }, { displayName: 'Player', photoURL: null }), { displayName: 'Jane', photoURL: 'https://example.com/jane.jpg' });
});
