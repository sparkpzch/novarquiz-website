import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntryProgress, type EntryProgressDeps } from '../entry-progress';
import type { SavedProgress } from '@/lib/db/play-progress';

type Q = { id: string };

const progressAt = (questionId: string, startedAt = '1000'): SavedProgress => ({
  session_id: 's', user_id: 'u', attempt_boundary: 'first', question_id: questionId,
  question_started_at: startedAt, started_at: startedAt, score: 40, streak: 2, answer: null,
  completed: false, updated_at: new Date(0).toISOString(),
});

function fakeDb(questions: Q[], entryId: string, saved: SavedProgress | null) {
  let row = saved;
  const calls: string[] = [];
  const deps: EntryProgressDeps<Q> = {
    getEntryQuestion: async () => questions.find((q) => q.id === entryId) ?? null,
    getQuestionById: async (id) => questions.find((q) => q.id === id) ?? null,
    startProgress: async (questionId) => { calls.push('start'); row ??= progressAt(questionId); return row; },
    activateProgress: async (questionId) => { calls.push('activate'); row = { ...row!, question_id: questionId, started_at: '2000' }; return row; },
    restartProgress: async (staleId, questionId) => {
      calls.push('restart');
      if (row?.question_id === staleId) row = { ...row, question_id: questionId, score: 0, streak: 0, answer: null };
      return row;
    },
  };
  return { deps, calls, row: () => row };
}

test('saved progress pointing at a question deleted by a graph edit restarts from the entry question', async () => {
  // The run was saved on q-old; the quiz was then re-saved without q-old.
  const db = fakeDb([{ id: 'q-entry' }, { id: 'q-2' }], 'q-entry', progressAt('q-old'));
  const result = await resolveEntryProgress(progressAt('q-old'), db.deps);
  assert.ok(result, 'must not 404 when the saved question no longer exists');
  assert.equal(result.question.id, 'q-entry');
  assert.equal(result.progress.question_id, 'q-entry');
  assert.equal(result.progress.score, 0);
  assert.deepEqual(db.calls, ['restart']);
});

test('saved progress on an existing question resumes on that question unchanged', async () => {
  const db = fakeDb([{ id: 'q-entry' }, { id: 'q-2' }], 'q-entry', progressAt('q-2'));
  const result = await resolveEntryProgress(progressAt('q-2'), db.deps);
  assert.equal(result?.question.id, 'q-2');
  assert.equal(result?.progress.score, 40);
  assert.deepEqual(db.calls, []);
});

test('no saved progress starts a new run on the entry question', async () => {
  const db = fakeDb([{ id: 'q-entry' }], 'q-entry', null);
  const result = await resolveEntryProgress(null, db.deps);
  assert.equal(result?.question.id, 'q-entry');
  assert.deepEqual(db.calls, ['start']);
});

test('a deferred lobby run is activated on the entry question', async () => {
  const deferred = progressAt('q-old', '0');
  const db = fakeDb([{ id: 'q-entry' }], 'q-entry', deferred);
  const result = await resolveEntryProgress(deferred, db.deps);
  assert.equal(result?.question.id, 'q-entry');
  assert.deepEqual(db.calls, ['activate']);
});

test('a quiz with no questions still has no entry question', async () => {
  const db = fakeDb([], 'q-entry', progressAt('q-old'));
  assert.equal(await resolveEntryProgress(progressAt('q-old'), db.deps), null);
  assert.equal(await resolveEntryProgress(null, fakeDb([], 'q-entry', null).deps), null);
});
