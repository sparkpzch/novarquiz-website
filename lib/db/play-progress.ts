import pool from './postgres';

export type SavedProgress = {
  session_id: string; user_id: string; attempt_boundary: string; question_id: string;
  question_started_at: string; started_at: string; score: number; streak: number;
  answer: { chosen_label: string; points_earned: number; explanation: string | null } | null;
  completed: boolean; updated_at: string;
};
export async function getProgress(sessionId: string, uid: string, boundary?: string) {
  const result = await pool.query<SavedProgress>('SELECT * FROM play_progress WHERE session_id=$1 AND user_id=$2 AND ($3::text IS NULL OR attempt_boundary=$3)', [sessionId, uid, boundary ?? null]);
  return result.rows[0] ?? null;
}
export async function startProgress(sessionId: string, uid: string, boundary: string, questionId: string, deferStart = false) {
  const now = deferStart ? 0 : Date.now();
  const result = await pool.query<SavedProgress>(`INSERT INTO play_progress (session_id,user_id,attempt_boundary,question_id,question_started_at,started_at)
    VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (session_id,user_id) DO UPDATE SET
    attempt_boundary=$3,question_id=$4,question_started_at=$5,started_at=$5,score=0,streak=0,answer=NULL,completed=FALSE,updated_at=clock_timestamp()
    WHERE play_progress.attempt_boundary<>$3 RETURNING *`, [sessionId, uid, boundary, questionId, now]);
  return result.rows[0] ?? await getProgress(sessionId, uid, boundary);
}
export async function activateProgress(sessionId: string, uid: string, boundary: string, questionId: string) {
  const now = Date.now();
  await pool.query(`UPDATE play_progress SET started_at=$5,question_started_at=$5,question_id=$4,updated_at=clock_timestamp()
    WHERE session_id=$1 AND user_id=$2 AND attempt_boundary=$3 AND started_at=0 AND NOT completed`, [sessionId,uid,boundary,questionId,now]);
  return getProgress(sessionId,uid,boundary);
}
export async function advanceProgress(sessionId: string, uid: string, boundary: string, fromId: string, questionId: string) {
  await pool.query(`UPDATE play_progress SET question_id=$5,question_started_at=$6,answer=NULL,updated_at=clock_timestamp()
    WHERE session_id=$1 AND user_id=$2 AND attempt_boundary=$3 AND question_id=$4 AND NOT completed`, [sessionId, uid, boundary, fromId, questionId, Date.now()]);
  return getProgress(sessionId, uid, boundary);
}
export async function answerProgress(sessionId: string, uid: string, boundary: string, questionId: string, answer: NonNullable<SavedProgress['answer']>) {
  await pool.query(`UPDATE play_progress SET answer=$5::jsonb,score=score+$6,streak=CASE WHEN $6>0 THEN streak+1 ELSE 0 END,updated_at=clock_timestamp()
    WHERE session_id=$1 AND user_id=$2 AND attempt_boundary=$3 AND question_id=$4 AND answer IS NULL AND NOT completed`,
  [sessionId, uid, boundary, questionId, JSON.stringify(answer), answer.points_earned]);
  return getProgress(sessionId, uid, boundary);
}
export async function completeProgress(sessionId: string, uid: string) {
  await pool.query('UPDATE play_progress SET completed=TRUE,updated_at=clock_timestamp() WHERE session_id=$1 AND user_id=$2', [sessionId, uid]);
}
export async function resetProgress(sessionId: string, uid: string) {
  await pool.query('DELETE FROM play_progress WHERE session_id=$1 AND user_id=$2 AND completed', [sessionId, uid]);
}
