import pool from './postgres';

// ===================== Question Sessions =====================

export async function getAllSessions() {
  const result = await pool.query(
    `SELECT qs.*,
      (SELECT COUNT(*) FROM questions q WHERE q.session_id = qs.id)::int AS question_count,
      (SELECT COUNT(*) FROM leaderboard_entries le WHERE le.session_id = qs.id)::int AS play_count,
      (SELECT COALESCE(ROUND(AVG(le.total_score)), 0) FROM leaderboard_entries le WHERE le.session_id = qs.id)::int AS avg_score
     FROM question_sessions qs
     ORDER BY qs.created_at DESC`
  );
  return result.rows;
}

export async function getPublishedSessions() {
  const result = await pool.query(
    `SELECT qs.*, 
      (SELECT COUNT(*) FROM questions q WHERE q.session_id = qs.id) as question_count
     FROM question_sessions qs 
     WHERE qs.is_published = TRUE
     ORDER BY qs.created_at DESC`
  );
  return result.rows;
}

export async function getSessionById(sessionId: string) {
  const result = await pool.query(
    'SELECT * FROM question_sessions WHERE id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

export async function getSessionByShareToken(token: string) {
  const result = await pool.query(
    `SELECT id, name, description, is_private, is_published, timer_seconds
     FROM question_sessions WHERE share_token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

export async function createSession(data: {
  name: string;
  description?: string;
  cover_image_url?: string;
  timer_seconds?: number;
  is_private?: boolean;
  is_published?: boolean;
  created_by: string;
}) {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const result = await pool.query(
    `INSERT INTO question_sessions (name, description, cover_image_url, timer_seconds, created_by, is_private, is_published, pin_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.name, data.description || null, data.cover_image_url || null, data.timer_seconds ?? null, data.created_by, data.is_private ?? false, data.is_published ?? false, pin]
  );
  return result.rows[0];
}

export async function updateSession(sessionId: string, data: Partial<{
  name: string;
  description: string;
  cover_image_url: string;
  timer_seconds: number;
  is_published: boolean;
  is_private: boolean;
  pin_code: string;
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

  const result = await pool.query(
    `UPDATE question_sessions SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteSession(sessionId: string) {
  await pool.query('DELETE FROM question_sessions WHERE id = $1', [sessionId]);
}

// Removes every trace of a Firebase user from analytics-bearing tables.
export async function deleteUserData(uid: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_answers WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM play_sessions WHERE user_id = $1', [uid]);
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

export async function getQuestionsBySession(sessionId: string) {
  const result = await pool.query(
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'points', c.score_impact) ORDER BY c.label) as choices
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
  const result = await pool.query(
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'points', c.score_impact) ORDER BY c.label) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.id = $1
     GROUP BY q.id`,
    [questionId]
  );
  return result.rows[0] || null;
}

export async function getEntryQuestion(sessionId: string) {
  const result = await pool.query(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'points', c.score_impact) ORDER BY c.label) as choices
     FROM questions q
     JOIN question_sessions qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.session_id = $1 AND q.is_entry_point = TRUE
     GROUP BY q.id, qs.timer_seconds`,
    [sessionId]
  );
  return result.rows[0] || null;
}

export async function createQuestion(data: {
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
  const result = await pool.query(
    `INSERT INTO questions (session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, node_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [data.session_id, data.question_order, data.question_text, data.media_type || null, data.media_url || null, data.timer_override || null, data.is_entry_point || false, data.node_x || 0, data.node_y || 0, data.node_type || 'normal']
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

export async function deleteQuestionsBySession(sessionId: string) {
  await pool.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);
}

// ===================== Choices =====================

export async function upsertChoices(questionId: string, choices: Array<{ label: string; choice_text: string; points: number }>) {
  // Delete existing choices and insert new ones
  await pool.query('DELETE FROM choices WHERE question_id = $1', [questionId]);
  for (const choice of choices) {
    await pool.query(
      `INSERT INTO choices (question_id, label, choice_text, score_impact) VALUES ($1, $2, $3, $4)`,
      [questionId, choice.label, choice.choice_text, Number.isFinite(choice.points) ? Math.trunc(choice.points) : 0]
    );
  }
}

// ===================== Connections =====================

export async function getConnectionsBySession(sessionId: string) {
  const result = await pool.query(
    'SELECT * FROM question_connections WHERE session_id = $1',
    [sessionId]
  );
  return result.rows;
}

export async function saveConnections(sessionId: string, connections: Array<{ from_question_id: string; from_choice_label: string; to_question_id: string }>) {
  await pool.query('DELETE FROM question_connections WHERE session_id = $1', [sessionId]);
  for (const conn of connections) {
    await pool.query(
      `INSERT INTO question_connections (session_id, from_question_id, from_choice_label, to_question_id) VALUES ($1, $2, $3, $4)`,
      [sessionId, conn.from_question_id, conn.from_choice_label, conn.to_question_id]
    );
  }
}

export async function getNextQuestion(fromQuestionId: string, choiceLabel: string) {
  const result = await pool.query(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'points', c.score_impact) ORDER BY c.label) as choices
     FROM question_connections qc
     JOIN questions q ON q.id = qc.to_question_id
     JOIN question_sessions qs ON qs.id = q.session_id
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
  // Look up the canonical points for the chosen choice — never trust the
  // client to send its own score. Falls back to 0 if the row is missing.
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
export async function completePlaySession(data: {
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
     FROM user_answers
     WHERE session_id = $1 AND user_id = $2`,
    [data.session_id, data.user_id],
  );
  const row = agg.rows[0] ?? { total_score: 0, positive_count: 0, nonpositive_count: 0, total_time_ms: 0 };

  // Streak = longest run of consecutive positive-points answers (chronological).
  // Computed in-app rather than SQL because the window-function version is
  // less readable than this two-pass loop and the row count per user is tiny.
  const ordered = await pool.query(
    `SELECT utility_score FROM user_answers
     WHERE session_id = $1 AND user_id = $2
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
    `UPDATE play_sessions
     SET finished_at = NOW(), current_score = $3
     WHERE session_id = $1 AND user_id = $2 AND finished_at IS NULL`,
    [data.session_id, data.user_id, row.total_score],
  );

  return { total_score: row.total_score as number, streak: best, total_time_ms: row.total_time_ms as number };
}

// Personal history across all sessions a user has played. Used by the
// /history page "My attempts" tab.
export async function getUserHistory(userId: string) {
  const result = await pool.query(
    `SELECT
       le.session_id,
       qs.name                             AS session_name,
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
     JOIN question_sessions qs ON qs.id = le.session_id
     WHERE le.user_id = $1
     ORDER BY le.completed_at DESC`,
    [userId],
  );
  return result.rows;
}

// ===================== Play Sessions =====================

export async function getOrCreatePlaySession(sessionId: string, userId: string) {
  // Try to get existing
  let result = await pool.query(
    'SELECT * FROM play_sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (result.rows[0]) return result.rows[0];

  // Get entry question
  const entry = await getEntryQuestion(sessionId);
  result = await pool.query(
    `INSERT INTO play_sessions (session_id, user_id, current_question_id) VALUES ($1, $2, $3) RETURNING *`,
    [sessionId, userId, entry?.id || null]
  );
  return result.rows[0];
}

export async function updatePlaySession(playSessionId: string, data: Partial<{
  current_question_id: string;
  current_score: number;
  current_streak: number;
  finished_at: string;
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
    `UPDATE play_sessions SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
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
