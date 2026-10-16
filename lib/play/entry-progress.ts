import type { SavedProgress } from '@/lib/db/play-progress';
import type { QueryResultRow } from 'pg';

export type EntryProgressDeps<Q extends QueryResultRow> = {
  getEntryQuestion: () => Promise<Q | null>;
  getQuestionById: (id: string) => Promise<Q | null>;
  startProgress: (questionId: string) => Promise<SavedProgress | null>;
  activateProgress: (questionId: string) => Promise<SavedProgress | null>;
  restartProgress: (staleQuestionId: string, questionId: string) => Promise<SavedProgress | null>;
};

// Picks the question a player opens or resumes on. play_progress.question_id
// has no foreign key, so re-saving the quiz graph can delete the question a
// saved run points at. Without the restart, every reload of that player's run
// 404s ("Could not load the first question") until the run is completed —
// which it never can be.
export async function resolveEntryProgress<Q extends QueryResultRow>(saved: SavedProgress | null, deps: EntryProgressDeps<Q>) {
  let progress = saved;
  const deferred = progress && Number(progress.started_at) === 0;
  let question = !progress || deferred ? await deps.getEntryQuestion() : await deps.getQuestionById(progress.question_id);
  if (!question && progress && !deferred) {
    question = await deps.getEntryQuestion();
    if (question) progress = await deps.restartProgress(progress.question_id, question.id);
  }
  if (!question) return null;
  if (deferred) progress = await deps.activateProgress(question.id);
  if (!progress) progress = await deps.startProgress(question.id);
  if (progress && progress.question_id !== question.id) question = await deps.getQuestionById(progress.question_id);
  if (!question || !progress) return null;
  return { question, progress };
}
