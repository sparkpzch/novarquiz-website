import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canJoinLobby, lobbyAccess, ownsLobbyMember, type LobbyState } from '../lobby-policy';
import { lobbyStandings } from '../lobby-standings';
import type { SessionRoom } from '@/lib/firebase/rtdb';

const room = (): LobbyState => ({ status: 'waiting', joinToken: 'invite', roundId: 'round-1',
  players: { account: { connectionId: 'device-A', roundId: 'round-1' } } });

test('private admission requires the actual live QR/URL token; ID, PIN, missing and stale tokens fail', () => {
  for (const invitation of [undefined, 'session-id', '123456', 'old-invite']) assert.equal(canJoinLobby(room(), true, invitation), false);
  assert.equal(canJoinLobby(room(), true, 'invite'), true);
  assert.equal(canJoinLobby({ ...room(), status: 'ended' }, true, 'invite'), false);
  assert.equal(canJoinLobby({ ...room(), joinToken: null }, true, 'invite'), false);
});

test('direct question access cannot bypass membership, connection ownership or waiting state', () => {
  assert.equal(lobbyAccess(room(), 'stranger', 'device-A', true), 'invitation_required');
  assert.equal(lobbyAccess(room(), 'account', null, true), 'session_replaced');
  assert.equal(lobbyAccess(room(), 'account', 'device-A', true), 'waiting');
  assert.equal(lobbyAccess({ ...room(), status: 'started' }, 'account', 'device-A', true), null);
});

test('A → B takeover revokes A; late A leave/disconnect never owns B entry', () => {
  const live = room();
  live.players!.account = { connectionId: 'device-B', roundId: 'round-1' };
  assert.equal(lobbyAccess(live, 'account', 'device-A', false), 'session_replaced');
  assert.equal(ownsLobbyMember(live.players!.account, 'device-A'), false);
  assert.equal(ownsLobbyMember(live.players!.account, 'device-B'), true);
  assert.equal(lobbyAccess(live, 'account', 'device-B', false), null);
});

test('closed, removed, left and reopened rooms revoke old connections', () => {
  assert.equal(lobbyAccess(null, 'account', 'device-A', false), 'closed');
  assert.equal(lobbyAccess({ ...room(), status: 'ended' }, 'account', 'device-A', false), 'closed');
  assert.equal(lobbyAccess({ ...room(), roundId: 'round-2' }, 'account', 'device-A', false), 'session_replaced');
  assert.equal(lobbyAccess({ ...room(), players: { account: { left: true } } }, 'account', 'device-A', false), 'invitation_required');
});

function standingsRoom(): SessionRoom {
  return { status: 'started', hostId: 'host', roundId: 'round-1', players: {
    a: { displayName: 'A', photoURL: null, joinedAt: 1, connectionId: 'new-a', roundId: 'round-1' },
    b: { displayName: 'B', photoURL: null, joinedAt: 2, lastActiveAt:95000, connectionId: 'b', roundId: 'round-1' },
    c: { displayName: 'C', photoURL: null, joinedAt: 3 },
  }, scores: {
    a: { displayName: 'A', photoURL: null, score: 10, updatedAt: 4, roundId: 'round-1' },
    b: { displayName: 'B', photoURL: null, score: 10, updatedAt: 5, roundId: 'round-1', finished: true },
    c: { displayName: 'C', photoURL: null, score: 0, updatedAt: 6, roundId: 'round-1' },
  }, connections: { a: { 'old-a': { oldTransport: true } }, b: { b: { transport: true } } } };
}

test('leaderboard includes zero/negative scores, shares tie ranks and has stable row ordering', () => {
  const live = standingsRoom();
  const rows = lobbyStandings(live, 100_000);
  assert.deepEqual(rows.map(row => [row.uid, row.rank, row.score]), [['a', 1, 10], ['b', 1, 10], ['c', 3, 0]]);
  live.scores!.c.score = -5;
  assert.equal(lobbyStandings(live)[2].score, -5);
});

test('old transport presence does not mark the latest device connected', () => {
  const rows = lobbyStandings(standingsRoom(), 100_000);
  assert.equal(rows[0].connected, false);
  assert.equal(rows[1].connected, true);
  assert.equal(rows[1].finished, true);
});

test('scores from previous rounds and orphaned historical participants cannot enter current standings', () => {
  const live = standingsRoom();
  live.scores!.a.roundId = 'round-old';
  live.scores!.a.finished = true;
  live.scores!.historical = { displayName: 'History', photoURL: null, score: 999, updatedAt: 4 };
  live.players!.c.left = true;
  const rows = lobbyStandings(live, 100_000);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.uid === 'a')?.score, 0);
  assert.equal(rows.find(row => row.uid === 'a')?.finished, false);
});

test('stale transport nodes cannot report an expired account session as connected', () => {
  const live = standingsRoom();
  live.players!.b.lastActiveAt=1;
  assert.equal(lobbyStandings(live,100_000).find(row=>row.uid==='b')?.connected,false);
});
