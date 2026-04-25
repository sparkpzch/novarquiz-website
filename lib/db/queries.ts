import { randomInt, randomUUID } from 'node:crypto';
import pool, { queryWithRetry } from './postgres';

// ===================== Quizzes =====================

export async function getAllQuizzes() {
  const result = await queryWithRetry(
    `SELECT qs.*, 
      COALESCE(p.display_name, (SELECT user_display_name FROM leaderboard_entries le WHERE le.user_id = qs.created_by LIMIT 1)) as creator_name,
      (SELECT COUNT(*) FROM questions q WHERE q.session_id = qs.id)::int AS question_count,
      (SELECT COUNT(*) 
       FROM leaderboard_entries le 
       JOIN sessions s ON le.session_id::text = s.id::text 
       WHERE s.session_id::text = qs.id::text)::int AS play_count,
      (SELECT COALESCE(ROUND(AVG(le.total_score)), 0) 
       FROM leaderboard_entries le 
       JOIN sessions s ON le.session_id::text = s.id::text 
       WHERE s.session_id::text = qs.id::text)::int AS avg_score
     FROM quizzes qs
     LEFT JOIN profiles p ON qs.created_by = p.uid
     ORDER BY qs.created_at DESC`
  );
  return result.rows;
}

export async function getAllSessions() {
  const result = await queryWithRetry(
    `SELECT s.*, 
      q.name as quiz_name, 
      s.name as raw_session_name,
      COALESCE(s.name, q.name) as name,
      q.description as description,
      q.cover_image_url as cover_image_url,
      COALESCE(p.display_name, (SELECT user_display_name FROM leaderboard_entries le WHERE le.user_id = s.user_id LIMIT 1)) as user_name,
      (SELECT COUNT(*) FROM questions q2 WHERE q2.session_id = q.id)::int AS question_count
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     ORDER BY s.started_at DESC`
  );
  return result.rows;
}

export async function getSessionByToken(token: string) {
  const result = await queryWithRetry(
    `SELECT s.*, 
       q.name as quiz_name, 
       COALESCE(s.name, q.name) as name,
       q.description as quiz_description
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     WHERE s.pin_code = $1 OR s.id::text = $2
     LIMIT 1`,
    [token, token]
  );
  return result.rows[0];
}

export async function getPublishedQuizzes() {
  const result = await queryWithRetry(
    `SELECT qs.*, 
      (SELECT COUNT(*) FROM questions q WHERE q.session_id = qs.id) as question_count
     FROM quizzes qs 
     WHERE qs.is_published = TRUE
     ORDER BY qs.created_at DESC`
  );
  return result.rows;
}

export async function getQuizById(sessionId: string) {
  const result = await queryWithRetry(
    'SELECT * FROM quizzes WHERE id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

function generatePinCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Removed: getSessionByShareToken — share tokens now live in Firebase RTDB (joinTokens/{token})

export async function createQuiz(data: {
  id?: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  timer_seconds?: number;
  is_published?: boolean;
  created_by: string;
}) {
  const quizId = data.id ?? randomUUID();
  const result = await queryWithRetry(
    `INSERT INTO quizzes (id, name, description, cover_image_url, timer_seconds, created_by, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       cover_image_url = EXCLUDED.cover_image_url,
       timer_seconds = EXCLUDED.timer_seconds,
       is_published = EXCLUDED.is_published,
       updated_at = NOW()
     RETURNING *`,
    [
      quizId,
      data.name,
      data.description || null,
      data.cover_image_url || null,
      data.timer_seconds ?? null,
      data.created_by,
      data.is_published ?? false,
    ],
    { allowWriteRetry: true }
  );
  return result.rows[0];
}

export async function updateQuiz(sessionId: string, data: Partial<{
  name: string;
  description: string;
  cover_image_url: string;
  timer_seconds: number;
  is_published: boolean;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${paramIdx}`);
    values.push(value);
    paramIdx++;
  }
  fields.push(`updated_at = NOW()`);
  values.push(sessionId);

  const result = await queryWithRetry(
    `UPDATE quizzes SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values,
    { allowWriteRetry: true }
  );
  return result.rows[0];
}

export async function deleteQuiz(id: string) {
  await pool.query('DELETE FROM quizzes WHERE id = $1', [id]);
}

export async function createSession(quizId: string, userId: string, isPrivate: boolean = true, name?: string) {
  const entry = await getEntryQuestion(quizId);

  const result = await queryWithRetry(
    `INSERT INTO sessions (session_id, user_id, current_question_id, pin_code, is_private, name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [quizId, userId, entry?.id || null, null, isPrivate, name || null, 'closed'],
    { allowWriteRetry: true }
  );
  return result.rows[0];
}

export async function deleteSession(id: string) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function duplicateQuiz(sourceId: string, createdBy: string, isQuizDuplicate: boolean) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get original session
    const { rows: qsRows } = await client.query('SELECT * FROM quizzes WHERE id = $1', [sourceId]);
    if (qsRows.length === 0) throw new Error('Source session not found');
    const orig = qsRows[0];

    // Determine new properties
    const newName = isQuizDuplicate ? `${orig.name} (Copy)` : orig.name;

    // 2. Duplicate quizzes record
    const { rows: newQsRows } = await client.query(
      `INSERT INTO quizzes (name, description, cover_image_url, timer_seconds, created_by, is_published)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newName, orig.description, orig.cover_image_url, orig.timer_seconds, createdBy, false]
    );
    const newSession = newQsRows[0];

    // 3. Get all questions
    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE session_id = $1', [sourceId]);
    const questionIdMap: Record<string, string> = {};

    for (const q of qRows) {
      const { rows: newQRows } = await client.query(
        `INSERT INTO questions (session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, node_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [newSession.id, q.question_order, q.question_text, q.media_type, q.media_url, q.timer_override, q.is_entry_point, q.node_x, q.node_y, q.node_type]
      );
      const newQId = newQRows[0].id;
      questionIdMap[q.id] = newQId;

      // 4. Copy choices for this question
      const { rows: cRows } = await client.query('SELECT * FROM choices WHERE question_id = $1', [q.id]);
      for (const c of cRows) {
        await client.query(
          `INSERT INTO choices (question_id, label, choice_text, score_impact, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [newQId, c.label, c.choice_text, c.score_impact, c.explanation]
        );
      }
    }

    // 5. Re-map Connections
    const { rows: connRows } = await client.query('SELECT * FROM question_connections WHERE session_id = $1', [sourceId]);
    for (const conn of connRows) {
      const newFrom = questionIdMap[conn.from_question_id];
      const newTo = questionIdMap[conn.to_question_id];
      if (newFrom && newTo) {
        await client.query(
          `INSERT INTO question_connections (session_id, from_question_id, from_choice_label, to_question_id, connection_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [newSession.id, newFrom, conn.from_choice_label, newTo, conn.connection_type]
        );
      }
    }

    await client.query('COMMIT');
    return newSession;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Removes every trace of a Firebase user from analytics-bearing tables.
export async function deleteUserData(uid: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_answers WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM leaderboard_entries WHERE user_id = $1', [uid]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ===================== Questions =====================

export async function getQuestionsByQuiz(sessionId: string) {
  const result = await queryWithRetry(
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'score_impact', c.score_impact, 'points', c.score_impact, 'explanation', c.explanation) ORDER BY c.label) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.session_id = $1
     GROUP BY q.id
     ORDER BY q.question_order`,
    [sessionId]
  );
  return result.rows;
}

export async function getQuestionById(questionId: string) {
  const result = await queryWithRetry(
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'score_impact', c.score_impact, 'points', c.score_impact, 'explanation', c.explanation) ORDER BY c.label) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.id = $1
     GROUP BY q.id`,
    [questionId]
  );
  return result.rows[0] || null;
}

export async function getEntryQuestion(id: string) {
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'score_impact', c.score_impact, 'points', c.score_impact, 'explanation', c.explanation) ORDER BY c.label) as choices
     FROM questions q
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE (q.session_id = $1 OR q.session_id = (SELECT session_id FROM sessions WHERE id = $1)) 
       AND q.is_entry_point = TRUE
     GROUP BY q.id, qs.timer_seconds`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createQuestion(data: {
  id?: string;
  session_id: string;
  question_order: number;
  question_text: string;
  media_type?: string;
  media_url?: string;
  timer_override?: number;
  is_entry_point?: boolean;
  node_x?: number;
  node_y?: number;
  node_type?: string;
}) {
  const questionId = data.id ?? randomUUID();
  const result = await queryWithRetry(
    `INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, node_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       session_id = EXCLUDED.session_id,
       question_order = EXCLUDED.question_order,
       question_text = EXCLUDED.question_text,
       media_type = EXCLUDED.media_type,
       media_url = EXCLUDED.media_url,
       timer_override = EXCLUDED.timer_override,
       is_entry_point = EXCLUDED.is_entry_point,
       node_x = EXCLUDED.node_x,
       node_y = EXCLUDED.node_y,
       node_type = EXCLUDED.node_type,
       updated_at = NOW()
     RETURNING *`,
    [questionId, data.session_id, data.question_order, data.question_text, data.media_type || null, data.media_url || null, data.timer_override || null, data.is_entry_point || false, data.node_x || 0, data.node_y || 0, data.node_type || 'normal'],
    { allowWriteRetry: true }
  );
  return result.rows[0];
}

export async function updateQuestion(questionId: string, data: Partial<{
  question_text: string;
  media_type: string;
  media_url: string;
  timer_override: number;
  is_entry_point: boolean;
  node_x: number;
  node_y: number;
  question_order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${paramIdx}`);
    values.push(value);
    paramIdx++;
  }
  fields.push(`updated_at = NOW()`);
  values.push(questionId);

  const result = await pool.query(
    `UPDATE questions SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteQuestion(questionId: string) {
  await pool.query('DELETE FROM questions WHERE id = $1', [questionId]);
}

export async function deleteQuestionsByQuiz(sessionId: string) {
  await queryWithRetry('DELETE FROM questions WHERE session_id = $1', [sessionId], {
    allowWriteRetry: true,
  });
}

// ===================== Choices =====================

export async function upsertChoices(questionId: string, choices: Array<{
  label: string;
  choice_text: string;
  score_impact?: number;
  points?: number;
  explanation?: string;
}>) {
  // Delete existing choices and insert new ones
  await queryWithRetry('DELETE FROM choices WHERE question_id = $1', [questionId], {
    allowWriteRetry: true,
  });
  for (const choice of choices) {
    const rawScoreImpact =
      typeof choice.score_impact === 'number' && Number.isFinite(choice.score_impact)
        ? choice.score_impact
        : typeof choice.points === 'number' && Number.isFinite(choice.points)
          ? choice.points
          : 0;
    const scoreImpact = Math.trunc(rawScoreImpact);

    await queryWithRetry(
      `INSERT INTO choices (question_id, label, choice_text, score_impact, explanation)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (question_id, label) DO UPDATE SET
         choice_text = EXCLUDED.choice_text,
         score_impact = EXCLUDED.score_impact,
         explanation = EXCLUDED.explanation`,
      [questionId, choice.label, choice.choice_text, scoreImpact, choice.explanation ?? null],
      { allowWriteRetry: true }
    );
  }
}

// ===================== Connections =====================

export async function getConnectionsByQuiz(sessionId: string) {
  const result = await queryWithRetry(
    'SELECT * FROM question_connections WHERE session_id = $1',
    [sessionId]
  );
  return result.rows;
}

export async function saveConnections(sessionId: string, connections: Array<{ from_question_id: string; from_choice_label: string; to_question_id: string }>) {
  await queryWithRetry('DELETE FROM question_connections WHERE session_id = $1', [sessionId], {
    allowWriteRetry: true,
  });
  for (const conn of connections) {
    await queryWithRetry(
      `INSERT INTO question_connections (session_id, from_question_id, from_choice_label, to_question_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (from_question_id, from_choice_label) DO UPDATE SET
         session_id = EXCLUDED.session_id,
         to_question_id = EXCLUDED.to_question_id`,
      [sessionId, conn.from_question_id, conn.from_choice_label, conn.to_question_id],
      { allowWriteRetry: true }
    );
  }
}

export async function getNextQuestion(fromQuestionId: string, choiceLabel: string) {
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'score_impact', c.score_impact, 'points', c.score_impact, 'explanation', c.explanation) ORDER BY c.label) as choices
     FROM question_connections qc
     JOIN questions q ON q.id = qc.to_question_id
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE qc.from_question_id = $1 AND qc.from_choice_label = $2
     GROUP BY q.id, qs.timer_seconds`,
    [fromQuestionId, choiceLabel]
  );
  return result.rows[0] || null;
}

// ===================== User Answers =====================

// Persists one answer + computes the points server-side from the chosen
// choice's `points` column. Returns the points awarded so the caller can
// surface them in the response (and clients can update RTDB live score).
export async function saveUserAnswer(data: {
  session_id: string;
  user_id: string;
  question_id: string;
  chosen_label: string;
  time_taken_ms: number;
}): Promise<{ id: string; points_earned: number }> {
  // Look up the canonical points for the chosen choice
  const choiceResult = await pool.query(
    `SELECT score_impact FROM choices WHERE question_id = $1 AND label = $2`,
    [data.question_id, data.chosen_label],
  );
  const points = (choiceResult.rows[0]?.score_impact as number | undefined) ?? 0;

  const result = await pool.query(
    `INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [data.session_id, data.user_id, data.question_id, data.chosen_label, data.time_taken_ms, points]
  );
  return { id: result.rows[0].id, points_earned: points };
}

// Aggregates a player's user_answers into a single leaderboard_entries row.
// Called when a player reaches the end of their path (or runs out of time).
// Idempotent — re-running for the same user just refreshes the snapshot.
export async function completeSession(data: {
  session_id: string;
  user_id: string;
  user_display_name: string;
  user_photo_url?: string | null;
}) {
  const agg = await pool.query(
    `SELECT
       COALESCE(SUM(utility_score), 0)::int            AS total_score,
       COALESCE(SUM(CASE WHEN utility_score > 0 THEN 1 ELSE 0 END), 0)::int AS positive_count,
       COALESCE(SUM(CASE WHEN utility_score <= 0 THEN 1 ELSE 0 END), 0)::int AS nonpositive_count,
       COALESCE(SUM(time_taken_ms), 0)::int            AS total_time_ms
     FROM (
       SELECT DISTINCT ON (question_id) utility_score, time_taken_ms
       FROM user_answers
       WHERE session_id = $1 AND user_id = $2
       ORDER BY question_id, answered_at DESC
     ) latest_answers`,
    [data.session_id, data.user_id],
  );
  const row = agg.rows[0] ?? { total_score: 0, positive_count: 0, nonpositive_count: 0, total_time_ms: 0 };

  // Streak = longest run of consecutive positive-points answers (chronological).
  // Computed in-app rather than SQL because the window-function version is
  // less readable than this two-pass loop and the row count per user is tiny.
  const ordered = await pool.query(
    `SELECT utility_score FROM (
       SELECT DISTINCT ON (question_id) utility_score, answered_at
       FROM user_answers
       WHERE session_id = $1 AND user_id = $2
       ORDER BY question_id, answered_at DESC
     ) latest_answers
     ORDER BY answered_at ASC`,
    [data.session_id, data.user_id],
  );
  let streak = 0, best = 0;
  for (const r of ordered.rows) {
    if ((r.utility_score as number) > 0) { streak += 1; if (streak > best) best = streak; }
    else streak = 0;
  }

  await pool.query(
    `INSERT INTO leaderboard_entries
       (session_id, user_id, user_display_name, user_photo_url,
        total_score, correct_count, incorrect_count, unanswered_count, streak, total_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)
     ON CONFLICT (session_id, user_id)
     DO UPDATE SET
       user_display_name = EXCLUDED.user_display_name,
       user_photo_url    = EXCLUDED.user_photo_url,
       total_score       = EXCLUDED.total_score,
       correct_count     = EXCLUDED.correct_count,
       incorrect_count   = EXCLUDED.incorrect_count,
       unanswered_count  = EXCLUDED.unanswered_count,
       streak            = EXCLUDED.streak,
       total_time_ms     = EXCLUDED.total_time_ms,
       completed_at      = NOW()`,
    [
      data.session_id, data.user_id, data.user_display_name, data.user_photo_url ?? null,
      row.total_score, row.positive_count, row.nonpositive_count, best, row.total_time_ms,
    ],
  );

  // Mark the play_session finished so the dashboard live widget can stop
  // showing it as in-progress.
  await pool.query(
    `UPDATE sessions
     SET finished_at = NOW(), current_score = $3
     WHERE session_id = $1 AND user_id = $2 AND finished_at IS NULL`,
    [data.session_id, data.user_id, row.total_score],
  );

  return { total_score: row.total_score as number, streak: best, total_time_ms: row.total_time_ms as number };
}

// Personal history across all sessions a user has played. Used by the
// /history page "My attempts" tab.
export async function getUserHistory(userId: string) {
  const result = await queryWithRetry(
    `SELECT
       le.session_id,
       COALESCE(s.name, qs.name)           AS session_name,
       qs.description                      AS session_description,
       le.total_score,
       le.correct_count,
       le.incorrect_count,
       le.streak,
       le.total_time_ms,
       le.completed_at,
       (
         SELECT COUNT(*) FROM leaderboard_entries
         WHERE session_id = le.session_id AND total_score > le.total_score
       )::int + 1                          AS rank,
       (SELECT COUNT(*) FROM leaderboard_entries WHERE session_id = le.session_id)::int AS total_players
     FROM leaderboard_entries le
     LEFT JOIN sessions s ON le.session_id::text = s.id::text
     LEFT JOIN quizzes qs ON (s.session_id::text = qs.id::text OR le.session_id::text = qs.id::text)
     WHERE le.user_id = $1
     ORDER BY le.completed_at DESC`,
    [userId],
  );
  return result.rows;
}

// ===================== Sessions =====================

export async function getOrCreateSession(quizId: string, userId: string, isPrivate: boolean = true, name?: string) {
  // Try to get existing
  let result = await pool.query(
    'SELECT * FROM sessions WHERE session_id = $1 AND user_id = $2',
    [quizId, userId]
  );
  if (result.rows[0]) return result.rows[0];

  // Get entry question
  const entry = await getEntryQuestion(quizId);

  result = await pool.query(
    `INSERT INTO sessions (session_id, user_id, current_question_id, pin_code, is_private, name, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [quizId, userId, entry?.id || null, null, isPrivate, name || null, 'closed']
  );
  return result.rows[0];
}

export async function updateSessionPin(id: string, pin: string | null) {
  await queryWithRetry(
    'UPDATE sessions SET pin_code = $1 WHERE id = $2',
    [pin, id],
    { allowWriteRetry: true }
  );
}

export async function updateSession(playSessionId: string, data: Partial<{
  current_question_id: string;
  current_score: number;
  current_streak: number;
  finished_at: string;
  status: 'closed' | 'opened' | 'started' | 'archived';
  pin_code: string | null;
  name: string | null;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${paramIdx}`);
    values.push(value);
    paramIdx++;
  }
  values.push(playSessionId);

  await pool.query(
    `UPDATE sessions SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
    values
  );
}

// ===================== Leaderboard =====================

export async function getLeaderboard(sessionId: string) {
  const result = await pool.query(
    `SELECT * FROM leaderboard_entries WHERE session_id = $1 ORDER BY total_score DESC`,
    [sessionId]
  );
  return result.rows;
}

export async function upsertLeaderboardEntry(data: {
  session_id: string;
  user_id: string;
  user_display_name: string;
  user_photo_url?: string;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  streak: number;
  total_time_ms: number;
}) {
  const result = await pool.query(
    `INSERT INTO leaderboard_entries (session_id, user_id, user_display_name, user_photo_url, total_score, correct_count, incorrect_count, unanswered_count, streak, total_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id, user_id) 
     DO UPDATE SET total_score = $5, correct_count = $6, incorrect_count = $7, unanswered_count = $8, streak = $9, total_time_ms = $10, completed_at = NOW()
     RETURNING *`,
    [data.session_id, data.user_id, data.user_display_name, data.user_photo_url || null, data.total_score, data.correct_count, data.incorrect_count, data.unanswered_count, data.streak, data.total_time_ms]
  );
  return result.rows[0];
}

export async function getSessionById(id: string) {
  const result = await queryWithRetry(
    `SELECT s.*, 
       q.name as quiz_name, 
       COALESCE(s.name, q.name) as name,
       q.description as quiz_description
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     WHERE s.id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function syncUserProfile(uid: string, displayName: string | null, photoURL: string | null) {
  await pool.query(
    `INSERT INTO profiles (uid, display_name, photo_url, last_seen)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (uid) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       photo_url = EXCLUDED.photo_url,
       last_seen = NOW()`,
    [uid, displayName, photoURL]
  );
}

export async function getSessionAnalytics(sessionId: string) {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const leaderboardResult = await pool.query(
    `SELECT le.*, p.photo_url as profile_photo 
     FROM leaderboard_entries le
     LEFT JOIN profiles p ON le.user_id = p.uid
     WHERE le.session_id = $1 
     ORDER BY le.total_score DESC`,
    [sessionId]
  );

  const questionsResult = await pool.query(
    `SELECT 
       q.id,
       q.question_text,
       q.question_order,
       q.node_type,
       (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1)::int as total_responses,
       (SELECT COALESCE(AVG(time_taken_ms), 0)::int FROM user_answers WHERE question_id = q.id AND session_id = $1) as avg_time_ms,
       COALESCE((
         SELECT json_agg(json_build_object(
           'label', c.label,
           'text', c.choice_text,
           'is_correct', (c.score_impact > 0),
           'count', (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1 AND chosen_label = c.label)::int
         ) ORDER BY c.label)
         FROM choices c
         WHERE c.question_id = q.id
       ), '[]'::json) as choices
     FROM questions q
     WHERE q.session_id = (SELECT session_id FROM sessions WHERE id = $1)
     ORDER BY q.question_order ASC`,
    [sessionId]
  );

  return {
    session,
    leaderboard: leaderboardResult.rows,
    questions: questionsResult.rows
  };
}
