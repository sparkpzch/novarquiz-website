import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, goOffline, ref, runTransaction, update } from 'firebase/database';
import { finishLobbyScore, presenceScore } from '../lobby-progress';
import { lobbyStandings } from '../lobby-standings';
import type { SessionRoom } from '@/lib/firebase/rtdb';

const startedRoom = (): SessionRoom => ({ status: 'started', roundId: 'round-1', hostId: 'host',
  players: { fast: { displayName: 'Fast', joinedAt: 1, connectionId: 'conn-1', roundId: 'round-1' } },
  scores: { fast: { displayName: 'Fast', photoURL: null, score: 0, finished: false, roundId: 'round-1', currentQuestionId: null, currentQuestionLabel: null, updatedAt: 1 } },
} as unknown as SessionRoom);

const progressLabel = (room: SessionRoom | null) => {
  const [row] = lobbyStandings(room, 2);
  return row.finished ? 'Finished' : row.currentQuestionLabel || 'Starting';
};

test('completion marks the lobby row finished and keeps round metadata', () => {
  const next = finishLobbyScore(startedRoom() as never, 'fast', 30, 'conn-1', 5) as unknown as SessionRoom;
  assert.equal(next.scores!.fast.finished, true);
  assert.equal(next.scores!.fast.score, 30);
  assert.equal(next.scores!.fast.roundId, 'round-1');
  assert.equal(progressLabel(next), 'Finished');
});

test('completion is skipped for a replaced, left or stale-round connection', () => {
  assert.equal(finishLobbyScore(startedRoom() as never, 'fast', 30, 'other-conn'), undefined);
  const left = startedRoom(); (left.players!.fast as { left?: boolean }).left = true;
  assert.equal(finishLobbyScore(left as never, 'fast', 30, 'conn-1'), undefined);
  assert.equal(finishLobbyScore({ ...startedRoom(), roundId: 'round-2' } as never, 'fast', 30, 'conn-1'), undefined);
});

test('bug repro: completion write lost, then post-completion presence ping → must not show "Starting"', () => {
  // Before the fix presence only nulled the label, leaving finished=false → "Starting".
  const room = startedRoom();
  room.scores!.fast = presenceScore(room.scores!.fast, null, true, 5) as NonNullable<SessionRoom["scores"]>[string];
  assert.equal(progressLabel(room), 'Finished');
});

test('presence for an unfinished player reports the DB question and never un-finishes', () => {
  const room = startedRoom();
  room.scores!.fast = presenceScore(room.scores!.fast, { id: 'q', question_order: 2 }, false, 5) as NonNullable<SessionRoom["scores"]>[string];
  assert.equal(progressLabel(room), 'Q3');
  room.scores!.fast = { ...room.scores!.fast, finished: true };
  room.scores!.fast = presenceScore(room.scores!.fast, null, false, 6) as NonNullable<SessionRoom["scores"]>[string];
  assert.equal(progressLabel(room), 'Finished');
  assert.equal(presenceScore(null, null, true), null, 'no score entry → no partial row created');
});

// Reproduces the race in the Firebase SDK itself (offline, no server needed).
// A child update() marks the in-flight room transaction SENT_NEEDS_ABORT (3):
// when the server answers "datastale" it is rejected with Error('set') instead
// of retried, so `finished: true` never lands. A child transaction leaves it
// SENT (1), so it retries normally. Reads SDK internals; update if they move.
async function roomTransactionStatusAfterChildWrite(write: 'update' | 'transaction') {
  const app = initializeApp({ databaseURL: 'https://lobby-race-test.firebaseio.com', projectId: 'lobby-race-test' }, `race-${write}`);
  const db = getDatabase(app);
  goOffline(db);
  void runTransaction(ref(db, 'sessions/s1'), room => ({ ...room, done: true })).catch(() => {});
  const child = ref(db, 'sessions/s1/scores/fast');
  if (write === 'update') void update(child, { currentQuestionLabel: null }).catch(() => {});
  else void runTransaction(child, current => current).catch(() => {});
  type QueueNode = { value?: { status: number }[]; children: Record<string, QueueNode> };
  const root = (db as unknown as { _repo: { transactionQueueTree_: { node: QueueNode } } })._repo.transactionQueueTree_.node;
  const status = root.children.sessions.children.s1.value?.[0]?.status;
  await deleteApp(app).catch(() => {});
  return status;
}

test('SDK: child update() marks the completion transaction for abort (root cause)', async () => {
  assert.equal(await roomTransactionStatusAfterChildWrite('update'), 3);
});

test('SDK: child transaction() leaves the completion transaction retryable (fix)', async () => {
  assert.equal(await roomTransactionStatusAfterChildWrite('transaction'), 1);
});
