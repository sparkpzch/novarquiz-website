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

export async function createSession(data: {
  name: string;
  description?: string;
  cover_image_url?: string;
  timer_seconds?: number;
  created_by: string;
}) {
  const result = await pool.query(
    `INSERT INTO question_sessions (name, description, cover_image_url, timer_seconds, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.description || null, data.cover_image_url || null, data.timer_seconds || 30, data.created_by]
  );
  return result.rows[0];
}

export async function updateSession(sessionId: string, data: Partial<{
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

  const result = await pool.query(
    `UPDATE question_sessions SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteSession(sessionId: string) {
  await pool.query('DELETE FROM question_sessions WHERE id = $1', [sessionId]);
}

// ===================== Questions =====================

export async function getQuestionsBySession(sessionId: string) {
  const result = await pool.query(
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'is_correct', c.is_correct) ORDER BY c.label) as choices
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
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'is_correct', c.is_correct) ORDER BY c.label) as choices
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
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'is_correct', c.is_correct) ORDER BY c.label) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.session_id = $1 AND q.is_entry_point = TRUE
     GROUP BY q.id`,
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

export async function upsertChoices(questionId: string, choices: Array<{ label: string; choice_text: string; is_correct: boolean }>) {
  // Delete existing choices and insert new ones
  await pool.query('DELETE FROM choices WHERE question_id = $1', [questionId]);
  for (const choice of choices) {
    await pool.query(
      `INSERT INTO choices (question_id, label, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
      [questionId, choice.label, choice.choice_text, choice.is_correct]
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
    `SELECT q.*, 
      json_agg(json_build_object('id', c.id, 'label', c.label, 'choice_text', c.choice_text, 'is_correct', c.is_correct) ORDER BY c.label) as choices
     FROM question_connections qc
     JOIN questions q ON q.id = qc.to_question_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE qc.from_question_id = $1 AND qc.from_choice_label = $2
     GROUP BY q.id`,
    [fromQuestionId, choiceLabel]
  );
  return result.rows[0] || null;
}

// ===================== User Answers =====================

export async function saveUserAnswer(data: {
  session_id: string;
  user_id: string;
  question_id: string;
  chosen_label: string;
  is_correct: boolean;
  time_taken_ms: number;
  points_earned: number;
}) {
  const result = await pool.query(
    `INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, is_correct, time_taken_ms, points_earned)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.session_id, data.user_id, data.question_id, data.chosen_label, data.is_correct, data.time_taken_ms, data.points_earned]
  );
  return result.rows[0];
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
