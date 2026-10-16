import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlayQuiz, isAdmittedLobbyPlayer, type LobbyState } from '../lobby-policy';

const room = (): LobbyState => ({ hostId: 'admin', status: 'started', joinToken: 'invite', roundId: 'round-1',
  players: { player: { connectionId: 'device-A', roundId: 'round-1' } } });
const draft = { is_published: false, created_by: 'admin' };
const player = { uid: 'player', isAdmin: false };

test('an invited player admitted to a started hosted lobby may play a draft quiz', async () => {
  assert.equal(isAdmittedLobbyPlayer(room(), 'player', 'device-A'), true);
  assert.equal(await canPlayQuiz(draft, player, async () => true), true);
});

test('draft access is refused without a live, owned lobby membership', () => {
  assert.equal(isAdmittedLobbyPlayer(null, 'player', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer(room(), 'stranger', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer(room(), 'player', null), false);
  assert.equal(isAdmittedLobbyPlayer(room(), 'player', 'device-B'), false);
  assert.equal(isAdmittedLobbyPlayer({ ...room(), roundId: 'round-2' }, 'player', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer({ ...room(), status: 'waiting' }, 'player', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer({ ...room(), status: 'ended' }, 'player', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer({ ...room(), joinToken: null }, 'player', 'device-A'), false);
  const left = room(); left.players!.player.left = true;
  assert.equal(isAdmittedLobbyPlayer(left, 'player', 'device-A'), false);
});

test('a solo or hostless room never unlocks a draft quiz', () => {
  assert.equal(isAdmittedLobbyPlayer({ ...room(), isSolo: true }, 'player', 'device-A'), false);
  assert.equal(isAdmittedLobbyPlayer({ ...room(), hostId: undefined }, 'player', 'device-A'), false);
});

test('owners, admins and published quizzes skip the lobby lookup; other players stay refused', async () => {
  const lookup = async () => { throw new Error('lobby lookup should not run'); };
  assert.equal(await canPlayQuiz({ ...draft, is_published: true }, player, lookup), true);
  assert.equal(await canPlayQuiz(draft, { uid: 'admin', isAdmin: false }, lookup), true);
  assert.equal(await canPlayQuiz(draft, { uid: 'other', isAdmin: true }, lookup), true);
  assert.equal(await canPlayQuiz(draft, player, async () => false), false);
});
