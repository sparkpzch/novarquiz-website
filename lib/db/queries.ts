import { randomUUID } from 'node:crypto';
import pool, { queryWithRetry } from './postgres';
import { maskPublicLeaderboardEntry, toPublicLeaderboardEntry } from './schema';
import { SESSION_STATUS, SessionStatus } from '../constants/session';
import { incrementMediaUsage, decrementMediaUsage, syncMediaUsage } from './media';
import {
  normalizeChoiceMetadata,
  type ConsentPurposes,
  type IntendedAudience,
} from '../analytics/quiz-metadata';
import { pickInsightTemplate } from '../analytics/insights';
import type {
  DraftScenario,
  InsightLocale,
  InsightReviewStatus,
  InsightSummary,
  InsightTemplate,
} from '../analytics/insights';
import type { HealthStatsInput, HealthTopicRow, TopicUnderstandingRow } from '../stats/health';

let layeredAnalyticsSchemaPromise: Promise<boolean> | null = null;
let intendedAudienceSchemaPromise: Promise<boolean> | null = null;
let questionTopicTagsSchemaPromise: Promise<boolean> | null = null;

async function hasLayeredAnalyticsSchema() {
  if (!layeredAnalyticsSchemaPromise) {
    layeredAnalyticsSchemaPromise = (async () => {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (
             (table_name = 'choices' AND column_name = 'behavior_meaning') OR
             (table_name = 'choices' AND column_name = 'clinical_tags') OR
             (table_name = 'user_answers' AND column_name = 'behavior_meaning_snapshot')
           )`,
      );

      return Number(result.rows[0]?.count ?? 0) === 3;
    })().catch(() => false);
  }

  return layeredAnalyticsSchemaPromise;
}

// Migration 014 removes quiz/question audience metadata while retaining the
// layered analytics columns. Keep this capability independent of that schema.
async function hasIntendedAudienceSchema() {
  if (!intendedAudienceSchemaPromise) {
    intendedAudienceSchemaPromise = pool
      .query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'quizzes'
             AND column_name = 'intended_audience'
         ) AS exists`,
      )
      .then((result) => result.rows[0]?.exists === true)
      .catch(() => false);
  }
  return intendedAudienceSchemaPromise;
}

async function hasQuestionTopicTagsSchema() {
  if (!questionTopicTagsSchemaPromise) {
    questionTopicTagsSchemaPromise = pool
      .query<{ exists: boolean }>(`SELECT to_regclass('question_topic_tags') IS NOT NULL AS exists`)
      .then((result) => result.rows[0]?.exists === true)
      .catch(() => false);
  }
  return questionTopicTagsSchemaPromise;
}

// ===================== Quizzes =====================

export async function getAllQuizzes() {
  const result = await queryWithRetry(
    `WITH question_counts AS (
       SELECT session_id, COUNT(*)::int AS question_count FROM questions GROUP BY session_id
     ), play_stats AS (
       SELECT s.session_id, COUNT(*)::int AS play_count,
         COALESCE(ROUND(AVG(le.total_score)), 0)::int AS avg_score
       FROM leaderboard_entries le JOIN sessions s ON le.session_id::text = s.id::text
       GROUP BY s.session_id
     ), names AS (
       SELECT DISTINCT ON (user_id) user_id, user_display_name
       FROM leaderboard_entries ORDER BY user_id, completed_at DESC NULLS LAST
     )
     SELECT qs.*, COALESCE(p.display_name, names.user_display_name) AS creator_name,
       COALESCE(qc.question_count, 0) AS question_count,
       COALESCE(ps.play_count, 0) AS play_count, COALESCE(ps.avg_score, 0) AS avg_score
     FROM quizzes qs
     LEFT JOIN profiles p ON qs.created_by = p.uid
     LEFT JOIN names ON names.user_id = qs.created_by
     LEFT JOIN question_counts qc ON qc.session_id = qs.id
     LEFT JOIN play_stats ps ON ps.session_id = qs.id
     ORDER BY qs.created_at DESC`
  );
  return result.rows;
}

export async function getAllSessions(visibleToUid?: string) {
  const where = visibleToUid ? `WHERE (s.is_private = FALSE OR s.user_id = $1)` : '';
  const params = visibleToUid ? [visibleToUid] : [];
  const result = await queryWithRetry(
    `WITH question_counts AS (
       SELECT session_id, COUNT(*)::int AS question_count FROM questions GROUP BY session_id
     ), play_stats AS (
       SELECT session_id, COUNT(*)::int AS play_count,
         COALESCE(ROUND(AVG(total_score)), 0)::int AS avg_score
       FROM leaderboard_entries GROUP BY session_id
     ), names AS (
       SELECT DISTINCT ON (user_id) user_id, user_display_name
       FROM leaderboard_entries ORDER BY user_id, completed_at DESC NULLS LAST
     )
     SELECT s.*, q.name AS quiz_name, s.name AS raw_session_name,
       COALESCE(s.name, q.name) AS name, q.description, q.cover_image_url, q.share_token,
       COALESCE(p.display_name, names.user_display_name) AS user_name,
       COALESCE(qc.question_count, 0) AS question_count,
       COALESCE(ps.play_count, 0) AS play_count, COALESCE(ps.avg_score, 0) AS avg_score
     FROM sessions s JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     LEFT JOIN names ON names.user_id = s.user_id
     LEFT JOIN question_counts qc ON qc.session_id = q.id
     LEFT JOIN play_stats ps ON ps.session_id::text = s.id::text
     ${where}
     ORDER BY s.started_at DESC`,
    params,
  );
  return result.rows;
}

export async function getSessionByToken(token: string) {
  const layered = await hasLayeredAnalyticsSchema();
  const result = await queryWithRetry(
    `SELECT s.*, 
       q.name as quiz_name, 
       s.name as raw_session_name,
       COALESCE(s.name, q.name) as name,
       q.description as description,
       q.cover_image_url as cover_image_url,
       q.share_token as share_token,
       q.timer_seconds as timer_seconds,
       (SELECT COUNT(*) FROM questions q2 WHERE q2.session_id = q.id)::int AS question_count,
       p.display_name as user_name
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     WHERE s.id::text = $1 OR s.pin_code = $1
     LIMIT 1`,
    [token]
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
    'SELECT * FROM quizzes WHERE id::text = $1 OR slug = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

export async function resolveQuizId(idOrSlug: string): Promise<string> {
  const quiz = await getQuizById(idOrSlug);
  if (!quiz) throw new Error('Quiz not found');
  return quiz.id;
}

// Resolves the URL `[sessionId]` segment to its underlying quiz_id.
// The play API accepts both a play-session row id (sessions.id) and a quiz id
// (quizzes.id) in the URL. To authorize answer submissions we need the
// canonical quiz id so we can verify the question belongs to that quiz.
export async function resolveSessionToQuizId(sessionId: string): Promise<string | null> {
  const quiz = await pool.query('SELECT id FROM quizzes WHERE id = $1', [sessionId]);
  if (quiz.rows[0]) return quiz.rows[0].id as string;
  const sess = await pool.query('SELECT session_id FROM sessions WHERE id = $1', [sessionId]);
  return (sess.rows[0]?.session_id as string | undefined) ?? null;
}

// Returns the earliest existing user_answers row for (session, user, question).
// Used to make POST /api/play/.../answer idempotent so a player cannot probe
// every choice and resubmit the highest-scoring one last.
/**
 * The player's answer to this question **in the current attempt**, if any.
 *
 * The caller uses this to refuse a second answer, which stops a player probing
 * every label to learn its score_impact and resubmitting the best one. That
 * guard has to be scoped to one attempt, or a replay keeps returning the
 * previous run's row — the player picks a different answer and still sees the
 * old points, which reads as "wrong answer marked correct".
 *
 * completeSession() writes leaderboard_entries.completed_at at the end of a
 * run, and it is always later than that run's last answer, so it is the
 * attempt boundary. There is one entry per (session, user), and its session_id
 * is the same value user_answers carries — including for a shared session,
 * where several players answer under one id and each has their own entry.
 *
 * Previous attempts stay in user_answers; only this lookup ignores them.
 */
export async function getExistingAnswer(
  sessionId: string,
  userId: string,
  questionId: string,
): Promise<{
  id: string;
  chosen_label: string;
  points_earned: number;
  explanation: string | null;
  behavior_meaning: string | null;
} | null> {
  const layered = await hasLayeredAnalyticsSchema();
  const result = await pool.query(
    layered
      ? `SELECT ua.id, ua.chosen_label, ua.utility_score, ua.behavior_meaning_snapshot,
                c.explanation
         FROM user_answers ua
         LEFT JOIN choices c ON c.question_id = ua.question_id AND c.label = ua.chosen_label
         WHERE ua.session_id = $1 AND ua.user_id = $2 AND ua.question_id = $3
           AND ua.answered_at > COALESCE(
             (SELECT le.completed_at FROM leaderboard_entries le
              WHERE le.session_id = $1 AND le.user_id = $2),
             '-infinity'::timestamptz
           )
         ORDER BY ua.answered_at ASC, ua.id ASC LIMIT 1`
      : `SELECT ua.id, ua.chosen_label, ua.utility_score, c.explanation
         FROM user_answers ua
         LEFT JOIN choices c ON c.question_id = ua.question_id AND c.label = ua.chosen_label
         WHERE ua.session_id = $1 AND ua.user_id = $2 AND ua.question_id = $3
           AND ua.answered_at > COALESCE(
             (SELECT le.completed_at FROM leaderboard_entries le
              WHERE le.session_id = $1 AND le.user_id = $2),
             '-infinity'::timestamptz
           )
         ORDER BY ua.answered_at ASC, ua.id ASC LIMIT 1`,
    [sessionId, userId, questionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    chosen_label: row.chosen_label as string,
    points_earned: (row.utility_score as number | undefined) ?? 0,
    explanation: typeof row.explanation === 'string' ? row.explanation : null,
    behavior_meaning:
      typeof row.behavior_meaning_snapshot === 'string' ? row.behavior_meaning_snapshot : null,
  };
}

// Serialize answers for one player in one session across concurrent requests.
// The lock spans the existing-answer check and insert, including retries.
export async function withPlayerAnswerLock<T>(sessionId: string, userId: string, work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${sessionId}:${userId}`]);
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// A completed run changes this value, invalidating question proofs from that
// run before the next run starts.
export async function getAttemptBoundary(sessionId: string, userId: string): Promise<string> {
  const result = await pool.query(
    'SELECT completed_at FROM leaderboard_entries WHERE session_id = $1 AND user_id = $2',
    [sessionId, userId],
  );
  const completedAt = result.rows[0]?.completed_at;
  return completedAt instanceof Date ? completedAt.toISOString() : (completedAt ? String(completedAt) : 'first');
}

// Removed: getSessionByShareToken — share tokens now live in Firebase RTDB (joinTokens/{token})
export async function createQuiz(data: {
  id?: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  cover_image_path?: string;
  timer_seconds?: number;
  created_by: string;
  is_published?: boolean;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quizId = data.id ?? randomUUID();
    const baseSlug = data.name.toLowerCase().trim().replace(/[^\u0E00-\u0E7Fa-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = baseSlug || 'quiz';

    const result = await client.query(
      `INSERT INTO quizzes (id, name, description, cover_image_url, cover_image_path, timer_seconds, created_by, is_published, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         description = EXCLUDED.description,
         cover_image_url = EXCLUDED.cover_image_url,
         cover_image_path = EXCLUDED.cover_image_path,
         timer_seconds = EXCLUDED.timer_seconds,
         is_published = EXCLUDED.is_published,
         updated_at = NOW()
       RETURNING *`,
      [quizId, data.name, data.description || null, data.cover_image_url || null, data.cover_image_path || null, data.timer_seconds ?? null, data.created_by, data.is_published ?? false, slug]
    );

    if (data.cover_image_path) {
      await incrementMediaUsage(client, data.cover_image_path);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const ALLOWED_QUIZ_FIELDS: ReadonlySet<string> = new Set([
  'name', 'description', 'cover_image_url', 'cover_image_path', 'timer_seconds', 'is_published',
  'shuffle_choices',
]);

export async function updateQuiz(sessionId: string, data: Partial<{
  name: string;
  description: string;
  cover_image_url: string;
  cover_image_path: string;
  timer_seconds: number;
  is_published: boolean;
  shuffle_choices: boolean;
}>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const realId = await resolveQuizId(sessionId);

    // Get old path
    const { rows: oldRows } = await client.query('SELECT cover_image_path FROM quizzes WHERE id = $1', [realId]);
    const oldPath = oldRows[0]?.cover_image_path;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (!ALLOWED_QUIZ_FIELDS.has(key)) continue;
      fields.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }

    if (data.name) {
    const baseSlug = data.name.toLowerCase().trim().replace(/[^\u0E00-\u0E7Fa-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = baseSlug || 'quiz';
      fields.push(`slug = $${paramIdx}`);
      values.push(slug);
      paramIdx++;
    }

    fields.push(`updated_at = NOW()`);
    values.push(realId);

    const result = await client.query(
      `UPDATE quizzes SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    // Sync media usage
    if (data.cover_image_path !== undefined && data.cover_image_path !== oldPath) {
      if (oldPath) await decrementMediaUsage(client, oldPath);
      if (data.cover_image_path) await incrementMediaUsage(client, data.cover_image_path);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteQuiz(idOrSlug: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await resolveQuizId(idOrSlug);
    
    // 1. Get all media paths for questions in this quiz
    const { rows: mediaRows } = await client.query('SELECT media_path FROM questions WHERE session_id = $1', [id]);
    const { rows: quizRows } = await client.query('SELECT cover_image_path FROM quizzes WHERE id = $1', [id]);
    
    // 2. Delete quiz (will cascade delete questions in DB if set, but let's be explicit if needed)
    // Actually, we need to decrement counts BEFORE we lose the references in the DB
    for (const row of mediaRows) {
      if (row.media_path) await decrementMediaUsage(client, row.media_path);
    }
    if (quizRows[0]?.cover_image_path) {
      await decrementMediaUsage(client, quizRows[0].cover_image_path);
    }

    await client.query('DELETE FROM quizzes WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createSession(quizId: string, userId: string, isPrivate: boolean = true, name?: string) {
  const entry = await getEntryQuestion(quizId);
  const quiz = await getQuizById(quizId);
  const baseName = name || quiz?.name || 'session';
  const slug = baseName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + randomUUID().substring(0, 4);

  const result = await queryWithRetry(
    `INSERT INTO sessions (session_id, user_id, current_question_id, pin_code, is_private, name, status, slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [quizId, userId, entry?.id || null, null, isPrivate, name || null, SESSION_STATUS.CLOSED, slug],
    { allowWriteRetry: true }
  );
  return result.rows[0];
}

export async function deleteSession(id: string) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function duplicateQuiz(sourceIdOrSlug: string, createdBy: string, isQuizDuplicate: boolean) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const layered = await hasLayeredAnalyticsSchema();
    const sourceId = await resolveQuizId(sourceIdOrSlug);

    // 1. Get original session
    const { rows: qsRows } = await client.query('SELECT * FROM quizzes WHERE id = $1', [sourceId]);
    if (qsRows.length === 0) throw new Error('Source session not found');
    const orig = qsRows[0];

    // Determine new properties
    const newName = isQuizDuplicate ? `${orig.name} (Copy)` : orig.name;

    // 2. Duplicate quizzes record
    const { rows: newQsRows } = await client.query(
      `INSERT INTO quizzes (name, description, cover_image_url, cover_image_path, timer_seconds, created_by, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [newName, orig.description, orig.cover_image_url, orig.cover_image_path, orig.timer_seconds, createdBy, false]
    );
    const newSession = newQsRows[0];
    if (orig.cover_image_path) {
      await incrementMediaUsage(client, orig.cover_image_path);
    }

    // 3. Get all questions
    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE session_id = $1', [sourceId]);
    const questionIdMap: Record<string, string> = {};

    for (const q of qRows) {
      const { rows: newQRows } = await client.query(
        `INSERT INTO questions (session_id, question_order, question_text, node_name, media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          newSession.id,
          q.question_order,
          q.question_text,
          q.node_name,
          q.media_type,
          q.media_url,
          q.media_path,
          q.timer_override,
          q.is_entry_point,
          q.node_x,
          q.node_y,
          q.node_type,
        ]
      );
      if (q.media_path) {
        await incrementMediaUsage(client, q.media_path);
      }
      const newQId = newQRows[0].id;
      questionIdMap[q.id] = newQId;

      // 4. Copy choices for this question
      const { rows: cRows } = await client.query('SELECT * FROM choices WHERE question_id = $1', [q.id]);
      for (const c of cRows) {
        await client.query(
          layered
            ? `INSERT INTO choices (
                 question_id, label, choice_text, score_impact, explanation,
                 behavior_meaning, clinical_tags
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`
            : `INSERT INTO choices (question_id, label, choice_text, score_impact, explanation)
               VALUES ($1, $2, $3, $4, $5)`,
          layered
            ? [
                newQId,
                c.label,
                c.choice_text,
                c.score_impact,
                c.explanation,
                c.behavior_meaning ?? null,
                JSON.stringify(c.clinical_tags ?? []),
              ]
            : [newQId, c.label, c.choice_text, c.score_impact, c.explanation]
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

// Removes every trace of a Firebase user from persisted app data.
export async function deleteUserData(uid: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_answers WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM leaderboard_entries WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM profiles WHERE uid = $1', [uid]);
    await client.query('DELETE FROM user_consents WHERE uid = $1', [uid]);
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
  const layered = await hasLayeredAnalyticsSchema();
  const choiceJson = layered ? buildChoiceJsonSql('c') : buildLegacyChoiceJsonSql('c');
  const result = await queryWithRetry(
    `SELECT q.*, 
      COALESCE(json_agg(${choiceJson} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM questions q
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE qs.id::text = $1 OR qs.slug = $1
     GROUP BY q.id
     ORDER BY q.question_order`,
    [sessionId]
  );
  return result.rows.map(hydrateQuestionRow);
}

// Resolves the parent quiz of a question for authorization checks.
// Returns null if the question doesn't exist.
export async function getQuizForQuestion(
  questionId: string,
): Promise<{
  quiz_id: string;
  is_published: boolean;
  created_by: string;
  shuffle_choices: boolean;
} | null> {
  const result = await pool.query(
    `SELECT qs.id AS quiz_id, qs.is_published, qs.created_by, qs.shuffle_choices
       FROM questions q
       JOIN quizzes qs ON qs.id = q.session_id
      WHERE q.id = $1
      LIMIT 1`,
    [questionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    quiz_id: row.quiz_id,
    is_published: !!row.is_published,
    created_by: row.created_by,
    shuffle_choices: !!row.shuffle_choices,
  };
}

export async function getQuestionById(questionId: string) {
  const layered = await hasLayeredAnalyticsSchema();
  const choiceJson = layered ? buildChoiceJsonSql('c') : buildLegacyChoiceJsonSql('c');
  const result = await queryWithRetry(
    `SELECT q.*, 
      COALESCE(json_agg(${choiceJson} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.id = $1
     GROUP BY q.id`,
    [questionId]
  );
  return result.rows[0] ? hydrateQuestionRow(result.rows[0]) : null;
}

// Returns the quiz's entry question. Falls back to the lowest question_order
// when no node is flagged: a quiz with questions but no entry point would
// otherwise 404 out of /api/play/<id>/answer?entry=true, which the player UI
// reads as "quiz finished" and drops straight onto the final leaderboard.
export async function getEntryQuestion(id: string) {
  const layered = await hasLayeredAnalyticsSchema();
  const choiceJson = layered ? buildChoiceJsonSql('c') : buildLegacyChoiceJsonSql('c');
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      COALESCE(json_agg(${choiceJson} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM questions q
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE (q.session_id = $1 OR q.session_id = (SELECT session_id FROM sessions WHERE id = $1))
     GROUP BY q.id, qs.timer_seconds
     ORDER BY q.is_entry_point DESC, q.question_order ASC
     LIMIT 1`,
    [id]
  );
  return result.rows[0] ? hydrateQuestionRow(result.rows[0]) : null;
}

export async function createQuestion(data: {
  id?: string;
  session_id: string;
  question_order: number;
  question_text: string;
  node_name?: string;
  media_type?: 'image' | 'gif' | 'video';
  media_url?: string;
  media_path?: string;
  timer_override?: number;
  is_entry_point?: boolean;
  node_x?: number;
  node_y?: number;
  node_type?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const layered = await hasLayeredAnalyticsSchema();
    const questionId = data.id ?? randomUUID();
    const result = await client.query(
      layered
        ? `INSERT INTO questions (
             id, session_id, question_order, question_text, node_name,
             media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             session_id = EXCLUDED.session_id,
             question_order = EXCLUDED.question_order,
             question_text = EXCLUDED.question_text,
             node_name = EXCLUDED.node_name,
             media_type = EXCLUDED.media_type,
             media_url = EXCLUDED.media_url,
             media_path = EXCLUDED.media_path,
             timer_override = EXCLUDED.timer_override,
             is_entry_point = EXCLUDED.is_entry_point,
             node_x = EXCLUDED.node_x,
             node_y = EXCLUDED.node_y,
             node_type = EXCLUDED.node_type,
             updated_at = NOW()
           RETURNING *`
        : `INSERT INTO questions (
             id, session_id, question_order, question_text, node_name,
             media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             session_id = EXCLUDED.session_id,
             question_order = EXCLUDED.question_order,
             question_text = EXCLUDED.question_text,
             node_name = EXCLUDED.node_name,
             media_type = EXCLUDED.media_type,
             media_url = EXCLUDED.media_url,
             media_path = EXCLUDED.media_path,
             timer_override = EXCLUDED.timer_override,
             is_entry_point = EXCLUDED.is_entry_point,
             node_x = EXCLUDED.node_x,
             node_y = EXCLUDED.node_y,
             node_type = EXCLUDED.node_type,
             updated_at = NOW()
           RETURNING *`,
      [
        questionId,
        data.session_id,
        data.question_order,
        data.question_text,
        data.node_name || null,
        data.media_type || null,
        data.media_url || null,
        data.media_path || null,
        data.timer_override || null,
        data.is_entry_point || false,
        data.node_x || 0,
        data.node_y || 0,
        data.node_type || 'normal',
      ],
    );
    
    if (data.media_path) {
      await incrementMediaUsage(client, data.media_path);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeChoiceScoreImpact(choice: {
  score_impact?: number;
  points?: number;
}) {
  const rawScoreImpact =
    typeof choice.score_impact === 'number' && Number.isFinite(choice.score_impact)
      ? choice.score_impact
      : typeof choice.points === 'number' && Number.isFinite(choice.points)
        ? choice.points
        : 0;

  return Math.trunc(rawScoreImpact);
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function parseRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) => key.trim() && typeof value === 'string' && value.trim(),
    ),
  );
}

function buildChoiceJsonSql(alias: string) {
  return `json_build_object(
    'id', ${alias}.id,
    'label', ${alias}.label,
    'choice_text', ${alias}.choice_text,
    'score_impact', ${alias}.score_impact,
    'points', ${alias}.score_impact,
    'explanation', ${alias}.explanation,
    'behavior_meaning', ${alias}.behavior_meaning,
    'clinical_tags', ${alias}.clinical_tags
  )`;
}

function buildLegacyChoiceJsonSql(alias: string) {
  return `json_build_object(
    'id', ${alias}.id,
    'label', ${alias}.label,
    'choice_text', ${alias}.choice_text,
    'score_impact', ${alias}.score_impact,
    'points', ${alias}.score_impact,
    'explanation', ${alias}.explanation
  )`;
}

function hydrateQuestionRow<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    choices: Array.isArray(row.choices)
      ? row.choices.map((choice) => {
          const rawChoice = (choice ?? {}) as Record<string, unknown>;
          const metadata = normalizeChoiceMetadata({
            behavior_meaning:
              typeof rawChoice.behavior_meaning === 'string' ? rawChoice.behavior_meaning : null,
            clinical_tags: parseStringArray(rawChoice.clinical_tags),
          });

          return {
            ...rawChoice,
            ...metadata,
          };
        })
      : row.choices,
  };
}

type GraphQuestionInput = {
  id?: string;
  question_order: number;
  question_text: string;
  node_name?: string | null;
  media_type?: 'image' | 'gif' | 'video' | null;
  media_url?: string | null;
  media_path?: string | null;
  timer_override?: number | null;
  is_entry_point?: boolean;
  node_x?: number;
  node_y?: number;
  node_type?: string;
  choices?: Array<{
    label: string;
    choice_text: string;
    score_impact?: number;
    points?: number;
    explanation?: string | null;
    behavior_meaning?: string | null;
    clinical_tags?: string[];
  }>;
};

type GraphConnectionInput = {
  from_question_id: string;
  from_choice_label: string;
  to_question_id: string;
};

export async function replaceQuizGraph(
  sessionId: string,
  questions: GraphQuestionInput[],
  connections: GraphConnectionInput[],
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const layered = await hasLayeredAnalyticsSchema();

    const { rows: oldRows } = await client.query(
      'SELECT media_path FROM questions WHERE session_id = $1',
      [sessionId],
    );
    const oldMediaPaths = oldRows.map((row) => row.media_path as string | null);

    await client.query('DELETE FROM question_connections WHERE session_id = $1', [sessionId]);
    await client.query(
      'DELETE FROM choices WHERE question_id IN (SELECT id FROM questions WHERE session_id = $1)',
      [sessionId],
    );
    await client.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);

    const idMap: Record<string, string> = {};
    const newMediaPaths: Array<string | null> = [];

    for (const question of questions) {
      const sourceId = question.id ?? randomUUID();
      const questionId = sourceId && UUID_RE.test(sourceId) ? sourceId : randomUUID();

      await client.query(
        layered
          ? `INSERT INTO questions (
               id, session_id, question_order, question_text, node_name,
               media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
          : `INSERT INTO questions (
               id, session_id, question_order, question_text, node_name,
               media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          questionId,
          sessionId,
          question.question_order,
          question.question_text,
          question.node_name ?? null,
          question.media_type ?? null,
          question.media_url ?? null,
          question.media_path ?? null,
          question.timer_override ?? null,
          question.is_entry_point ?? false,
          question.node_x ?? 0,
          question.node_y ?? 0,
          question.node_type ?? 'normal',
        ],
      );

      idMap[sourceId] = questionId;
      newMediaPaths.push(question.media_path ?? null);

      for (const choice of question.choices ?? []) {
        const choiceMetadata = normalizeChoiceMetadata(choice);
        await client.query(
          layered
            ? `INSERT INTO choices (
                 question_id, label, choice_text, score_impact, explanation,
                 behavior_meaning, clinical_tags
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`
            : `INSERT INTO choices (question_id, label, choice_text, score_impact, explanation)
               VALUES ($1, $2, $3, $4, $5)`,
          layered
            ? [
                questionId,
                choice.label,
                choice.choice_text,
                normalizeChoiceScoreImpact(choice),
                choice.explanation ?? null,
                choiceMetadata.behavior_meaning,
                JSON.stringify(choiceMetadata.clinical_tags),
              ]
            : [
                questionId,
                choice.label,
                choice.choice_text,
                normalizeChoiceScoreImpact(choice),
                choice.explanation ?? null,
              ],
        );
      }
    }

    for (const connection of connections) {
      const fromQuestionId = idMap[connection.from_question_id];
      const toQuestionId = idMap[connection.to_question_id];

      if (!fromQuestionId || !toQuestionId) continue;

      await client.query(
        `INSERT INTO question_connections (session_id, from_question_id, from_choice_label, to_question_id)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, fromQuestionId, connection.from_choice_label, toQuestionId],
      );
    }

    await syncMediaUsage(client, oldMediaPaths, newMediaPaths);

    await client.query('COMMIT');
    return { idMap };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const ALLOWED_QUESTION_FIELDS: ReadonlySet<string> = new Set([
  'question_text', 'node_name', 'media_type', 'media_url', 'media_path',
  'timer_override', 'is_entry_point', 'node_x', 'node_y', 'question_order',
]);

export async function updateQuestion(questionId: string, data: Partial<{
  question_text: string;
  node_name: string;
  media_type: string;
  media_url: string;
  media_path: string;
  timer_override: number;
  is_entry_point: boolean;
  node_x: number;
  node_y: number;
  question_order: number;
}>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get old data
    const { rows: oldRows } = await client.query('SELECT media_path FROM questions WHERE id = $1', [questionId]);
    const oldPath = oldRows[0]?.media_path;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (!ALLOWED_QUESTION_FIELDS.has(key)) continue;
      fields.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }
    fields.push(`updated_at = NOW()`);
    values.push(questionId);

    const result = await client.query(
      `UPDATE questions SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    // Sync media usage
    if (data.media_path !== undefined && data.media_path !== oldPath) {
      if (oldPath) await decrementMediaUsage(client, oldPath);
      if (data.media_path) await incrementMediaUsage(client, data.media_path);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteQuestion(questionId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT media_path FROM questions WHERE id = $1', [questionId]);
    if (rows[0]?.media_path) {
      await decrementMediaUsage(client, rows[0].media_path);
    }
    await client.query('DELETE FROM questions WHERE id = $1', [questionId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteQuestionsByQuiz(sessionId: string, preservePaths: Set<string> = new Set()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT media_path FROM questions WHERE session_id = $1', [sessionId]);
    for (const row of rows) {
      if (row.media_path && !preservePaths.has(row.media_path)) {
        await decrementMediaUsage(client, row.media_path);
      }
    }
    await client.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ===================== Choices =====================

export async function upsertChoices(questionId: string, choices: Array<{
  label: string;
  choice_text: string;
  score_impact?: number;
  points?: number;
  explanation?: string | null;
  behavior_meaning?: string | null;
  clinical_tags?: string[];
}>) {
  const layered = await hasLayeredAnalyticsSchema();
  // Delete existing choices and insert new ones
  await queryWithRetry('DELETE FROM choices WHERE question_id = $1', [questionId], {
    allowWriteRetry: true,
  });
  for (const choice of choices) {
    const metadata = normalizeChoiceMetadata(choice);
    await queryWithRetry(
      layered
        ? `INSERT INTO choices (
             question_id, label, choice_text, score_impact, explanation,
             behavior_meaning, clinical_tags
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (question_id, label) DO UPDATE SET
             choice_text = EXCLUDED.choice_text,
             score_impact = EXCLUDED.score_impact,
             explanation = EXCLUDED.explanation,
             behavior_meaning = EXCLUDED.behavior_meaning,
             clinical_tags = EXCLUDED.clinical_tags`
        : `INSERT INTO choices (question_id, label, choice_text, score_impact, explanation)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (question_id, label) DO UPDATE SET
             choice_text = EXCLUDED.choice_text,
             score_impact = EXCLUDED.score_impact,
             explanation = EXCLUDED.explanation`,
      layered
        ? [
            questionId,
            choice.label,
            choice.choice_text,
            normalizeChoiceScoreImpact(choice),
            choice.explanation ?? null,
            metadata.behavior_meaning,
            JSON.stringify(metadata.clinical_tags),
          ]
        : [
            questionId,
            choice.label,
            choice.choice_text,
            normalizeChoiceScoreImpact(choice),
            choice.explanation ?? null,
          ],
      { allowWriteRetry: true }
    );
  }
}

// ===================== Connections =====================

export async function getConnectionsByQuiz(sessionId: string) {
  const result = await queryWithRetry(
    `SELECT qc.* FROM question_connections qc
     JOIN quizzes qs ON qs.id = qc.session_id
     WHERE qs.id::text = $1 OR qs.slug = $1`,
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
  const layered = await hasLayeredAnalyticsSchema();
  const choiceJson = layered ? buildChoiceJsonSql('c') : buildLegacyChoiceJsonSql('c');
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      COALESCE(json_agg(${choiceJson} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM question_connections qc
     JOIN questions q ON q.id = qc.to_question_id
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE qc.from_question_id = $1 AND qc.from_choice_label = $2
     GROUP BY q.id, qs.timer_seconds`,
    [fromQuestionId, choiceLabel]
  );
  return result.rows[0] ? hydrateQuestionRow(result.rows[0]) : null;
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
}): Promise<{
  id: string;
  points_earned: number;
  explanation: string | null;
  behavior_meaning: string | null;
}> {
  const layered = await hasLayeredAnalyticsSchema();
  // Look up the canonical points for the chosen choice
  const choiceResult = await pool.query(
    layered
      ? `SELECT score_impact, explanation, behavior_meaning
         FROM choices
         WHERE question_id = $1 AND label = $2`
      : `SELECT score_impact, explanation FROM choices WHERE question_id = $1 AND label = $2`,
    [data.question_id, data.chosen_label],
  );
  const choice = choiceResult.rows[0] ?? {};
  const points = (choice.score_impact as number | undefined) ?? 0;
  const explanation = typeof choice.explanation === 'string' ? choice.explanation : null;
  const behaviorMeaning = typeof choice.behavior_meaning === 'string' ? choice.behavior_meaning : null;

  const result = await pool.query(
    layered
      ? `INSERT INTO user_answers (
           session_id, user_id, question_id, chosen_label, time_taken_ms,
           utility_score, behavior_meaning_snapshot
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`
      : `INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    layered
      ? [
          data.session_id,
          data.user_id,
          data.question_id,
          data.chosen_label,
          data.time_taken_ms,
          points,
          behaviorMeaning,
        ]
      : [
          data.session_id,
          data.user_id,
          data.question_id,
          data.chosen_label,
          data.time_taken_ms,
          points,
        ]
  );
  return {
    id: result.rows[0].id,
    points_earned: points,
    explanation,
    behavior_meaning: behaviorMeaning,
  };
}

export async function getUserCumulativeScore(sessionId: string, userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(utility_score), 0)::int AS total FROM (
       SELECT DISTINCT ON (question_id) utility_score
       FROM user_answers
       WHERE session_id = $1 AND user_id = $2
         AND answered_at > COALESCE(
           (SELECT le.completed_at FROM leaderboard_entries le WHERE le.session_id = $1 AND le.user_id = $2),
           '-infinity'::timestamptz
         )
       ORDER BY question_id, answered_at ASC, id ASC
     ) first_answers`,
    [sessionId, userId],
  );
  return (result.rows[0]?.total as number) ?? 0;
}

// Aggregates a player's user_answers into a single leaderboard_entries row.
// Called when a player reaches the end of their path (or runs out of time).
// Called once after the route verifies the player reached the end of a run.
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
         AND answered_at > COALESCE(
           (SELECT le.completed_at FROM leaderboard_entries le WHERE le.session_id = $1 AND le.user_id = $2),
           '-infinity'::timestamptz
         )
       ORDER BY question_id, answered_at ASC, id ASC
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
         AND answered_at > COALESCE(
           (SELECT le.completed_at FROM leaderboard_entries le WHERE le.session_id = $1 AND le.user_id = $2),
           '-infinity'::timestamptz
         )
       ORDER BY question_id, answered_at ASC, id ASC
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
     SET finished_at = NOW()
     WHERE session_id = $1 AND user_id = $2 AND finished_at IS NULL`,
    [data.session_id, data.user_id],
  );

  return {
    total_score: row.total_score as number,
    streak: best,
    total_time_ms: row.total_time_ms as number,
  };
}

// Personal history across all sessions a user has played. Used by the
// /history page "My attempts" tab.
export async function getUserHistory(userId: string) {
  const result = await queryWithRetry(
    `SELECT
       le.session_id,
       qs.id AS quiz_id,
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

// Personal question review is scoped to both the authenticated user and the
// selected run. Never return cohort answers through the player history API.
export async function getUserHistoryAnswers(userId: string, sessionId: string) {
  const [layered, questionTags] = await Promise.all([
    hasLayeredAnalyticsSchema(), hasQuestionTopicTagsSchema(),
  ]);
  const tags = questionTags
    ? `(SELECT COALESCE(jsonb_agg(tag ORDER BY tag), '[]'::jsonb)
        FROM question_topic_tags WHERE question_id = q.id)`
    : layered
      ? `(SELECT COALESCE(jsonb_agg(DISTINCT tag), '[]'::jsonb)
          FROM choices c CROSS JOIN LATERAL jsonb_array_elements_text(c.clinical_tags) tag
          WHERE c.question_id = q.id)`
      : `'[]'::jsonb`;
  const result = await queryWithRetry<{
    id: string; question: string; selected: string; selectedExplanation: string | null;
    selectedAligned: boolean; utilityScore: number; maxUtility: number;
    timeMs: number | null; tags: string[];
    alignedChoices: Array<{ text: string; explanation: string | null }>;
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (ua.question_id) ua.*
       FROM user_answers ua WHERE ua.user_id = $1 AND ua.session_id::text = $2
       ORDER BY ua.question_id, ua.answered_at DESC, ua.id DESC
     )
     SELECT q.id, q.question_text AS question, chosen.choice_text AS selected,
            chosen.explanation AS "selectedExplanation", (latest.utility_score > 0) AS "selectedAligned",
            latest.utility_score AS "utilityScore", latest.time_taken_ms AS "timeMs",
            (SELECT GREATEST(MAX(c.score_impact), 0) FROM choices c WHERE c.question_id = q.id) AS "maxUtility",
            ${tags} AS tags,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('text', c.choice_text, 'explanation', c.explanation) ORDER BY c.label)
              FROM choices c WHERE c.question_id = q.id AND c.score_impact > 0), '[]'::jsonb) AS "alignedChoices"
     FROM latest JOIN questions q ON q.id = latest.question_id
     JOIN quizzes quiz ON quiz.id = q.session_id AND quiz.is_published = TRUE
     JOIN choices chosen ON chosen.question_id = q.id AND chosen.label = latest.chosen_label
     ORDER BY q.question_order, q.id`,
    [userId, sessionId],
  );
  return result.rows;
}

// Raw inputs for the /stats Health tab — one topic per quiz. Uses the latest
// answer per (session, question), matching completeSession(). The quiz is
// resolved through questions.session_id, which always holds the quiz id,
// whether user_answers.session_id is a quiz id or a sessions.id.
export async function getUserHealthStatsInput(userId: string): Promise<HealthStatsInput> {
  const layered = await hasLayeredAnalyticsSchema();
  const hasQuestionTopicTags = await hasQuestionTopicTagsSchema();
  const questionTopicSourceCte = hasQuestionTopicTags
    ? `question_tags AS (
         SELECT question_id, tag
         FROM question_topic_tags
       )`
    : `question_tags AS (
         SELECT DISTINCT c.question_id, tags.tag
         FROM choices c
         CROSS JOIN LATERAL jsonb_array_elements_text(
           COALESCE(c.clinical_tags, '[]'::jsonb)
         ) AS tags(tag)
       )`;
  const topicBreakdownCte = `question_topics AS (
         SELECT q.id AS question_id,
                topic_tags.tag,
                GREATEST(MAX(COALESCE(c.score_impact, 0)), 0)::int AS max_utility
         FROM (SELECT DISTINCT question_id FROM latest_answers) answered_questions
         JOIN questions q ON q.id = answered_questions.question_id
         JOIN question_tags topic_tags ON topic_tags.question_id = q.id
         JOIN choices c ON c.question_id = q.id
         GROUP BY q.id, topic_tags.tag
       )`;
  const [topicAnalytics, days, totals, gaps] = await Promise.all([
    queryWithRetry<{ topics: HealthTopicRow[]; topic_breakdown: TopicUnderstandingRow[] }>(
      `WITH latest_answers AS MATERIALIZED (
         SELECT DISTINCT ON (ua.session_id, ua.question_id)
                ua.session_id, ua.question_id, ua.utility_score, ua.answered_at
         FROM user_answers ua
         WHERE ua.user_id = $1
         ORDER BY ua.session_id, ua.question_id, ua.answered_at DESC, ua.id DESC
       ), ${questionTopicSourceCte}, ${topicBreakdownCte}, quiz_topics AS (
         SELECT qz.id AS quiz_id,
                qz.name AS quiz_name,
                'public' AS audience,
                COUNT(*)::int AS answered,
                COUNT(*) FILTER (WHERE latest.utility_score > 0)::int AS positive,
                MAX(latest.answered_at)::text AS last_answered_at
         FROM latest_answers latest
         JOIN questions q ON q.id = latest.question_id
         JOIN quizzes qz ON qz.id = q.session_id
         GROUP BY qz.id, qz.name
       ), topic_breakdown_rows AS (
         SELECT qt.tag,
                COALESCE(SUM(latest.utility_score), 0)::int AS earned_utility,
                COALESCE(SUM(qt.max_utility), 0)::int AS max_utility,
                COUNT(*)::int AS responses,
                COUNT(DISTINCT (latest.session_id, latest.question_id))::int AS question_count
         FROM latest_answers latest
         JOIN question_topics qt ON qt.question_id = latest.question_id
         GROUP BY qt.tag
       )
       SELECT
         (SELECT COALESCE(json_agg(quiz_topics ORDER BY quiz_name), '[]'::json) FROM quiz_topics) AS topics,
         (SELECT COALESCE(json_agg(topic_breakdown_rows ORDER BY tag), '[]'::json) FROM topic_breakdown_rows) AS topic_breakdown`,
      [userId],
    ),
    queryWithRetry<{ day: string }>(
      `SELECT DISTINCT (answered_at AT TIME ZONE 'Asia/Bangkok')::date::text AS day
       FROM user_answers
       WHERE user_id = $1
       ORDER BY day DESC
       LIMIT 366`,
      [userId],
    ),
    queryWithRetry<{ published: number; completed: number; today: string }>(
      `SELECT
         (SELECT COUNT(*) FROM quizzes WHERE is_published = TRUE)::int AS published,
         (SELECT COUNT(DISTINCT qz.id)
          FROM leaderboard_entries le
          LEFT JOIN sessions s ON le.session_id::text = s.id::text
          JOIN quizzes qz ON qz.id::text = COALESCE(s.session_id::text, le.session_id::text)
          WHERE le.user_id = $1 AND qz.is_published = TRUE)::int AS completed,
         (NOW() AT TIME ZONE 'Asia/Bangkok')::date::text AS today`,
      [userId],
    ),
    // Clinical tags the player's own non-positive answers carried. Latest
    // answer per (session, question) only, matching the topic query above.
    layered
      ? queryWithRetry<{ quiz_id: string; tag: string }>(
          `SELECT qz.id AS quiz_id, tag
           FROM (
             SELECT DISTINCT ON (ua.session_id, ua.question_id)
                    ua.question_id, ua.utility_score, c.clinical_tags
             FROM user_answers ua
             JOIN choices c
               ON c.question_id = ua.question_id AND c.label = ua.chosen_label
             WHERE ua.user_id = $1
             ORDER BY ua.session_id, ua.question_id, ua.answered_at DESC
           ) latest
           JOIN questions q ON q.id = latest.question_id
           JOIN quizzes qz ON qz.id = q.session_id
           CROSS JOIN LATERAL jsonb_array_elements_text(latest.clinical_tags) AS t(tag)
           WHERE latest.utility_score <= 0
           GROUP BY qz.id, tag
           ORDER BY qz.id, COUNT(*) DESC, tag ASC`,
          [userId],
        )
      : Promise.resolve({ rows: [] as Array<{ quiz_id: string; tag: string }> }),
  ]);

  return {
    topics: topicAnalytics.rows[0]?.topics ?? [],
    topicBreakdownRows: topicAnalytics.rows[0]?.topic_breakdown ?? [],
    answerDays: days.rows.map((r) => r.day),
    today: totals.rows[0].today,
    completedQuizzes: totals.rows[0].completed,
    publishedQuizzes: totals.rows[0].published,
    gapTagRows: gaps.rows,
  };
}

// ===================== Insight templates =====================

// Same lazy probe as hasLayeredAnalyticsSchema(): the app has to keep working
// on a database where migration 010 has not been applied yet.
let insightTemplatesSchemaPromise: Promise<boolean> | null = null;

async function hasInsightTemplatesSchema() {
  if (insightTemplatesSchemaPromise) return insightTemplatesSchemaPromise;

  const probe = (async () => {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'insight_templates'
       ) AS "exists"`,
    );
    return result.rows[0]?.exists ?? false;
  })().catch(() => false);

  // Only a positive answer is worth keeping: a table, once created, stays.
  // Caching a negative one means a process that started before the migration
  // ran serves `null` summaries forever — which is exactly what a long-running
  // dev server did after migration 010 was applied mid-session.
  const exists = await probe;
  if (exists) insightTemplatesSchemaPromise = probe;
  return exists;
}

/**
 * The one summary a player is shown, or null when nothing approved matches.
 * Quiz-scoped and tag-specific rows take precedence. Only approved templates
 * are considered.
 */
export async function getApprovedInsightSummary(params: {
  quizId: string | null;
  tags: string[];
  audience: IntendedAudience;
  locale: InsightLocale;
}): Promise<InsightSummary | null> {
  const rows = await getApprovedInsightCandidates(params);
  const picked = pickInsightTemplate(rows, {
    quizId: params.quizId,
    tags: params.tags,
  });
  return picked ? { headline: picked.headline, body: picked.body, suggestion: picked.suggestion } : null;
}

type InsightCandidate = {
  quiz_id: string | null;
  archetype_id: string;
  clinical_tag: string;
  headline: string;
  body: string;
  suggestion: string | null;
};

/**
 * Every approved row that could apply to this quiz, audience and locale.
 * Narrow — one quiz's wording plus the global fallbacks — so the caller ranks
 * them in memory with pickInsightTemplate() instead of duplicating the rule in
 * SQL. The admin breakdown fetches this once and reuses it for every player.
 */
export async function getApprovedInsightCandidates(params: {
  quizId: string | null;
  audience: IntendedAudience;
  locale: InsightLocale;
}): Promise<InsightCandidate[]> {
  if (!(await hasInsightTemplatesSchema())) return [];

  const result = await queryWithRetry<InsightCandidate>(
    `SELECT quiz_id, archetype_id, clinical_tag, headline, body, suggestion
     FROM insight_templates
     WHERE review_status = 'approved'
       AND audience = $2
       AND locale = $3
       AND (quiz_id IS NULL OR quiz_id = $1)`,
    [params.quizId, params.audience, params.locale],
  );

  return result.rows;
}

/**
 * Per-player view of what the insight engine decided, for the admin screens.
 * Runs two queries for the whole quiz, then resolves each player in memory —
 * one query per player would not survive a busy session.
 */
export async function getQuizInsightBreakdown(
  quizId: string,
  locale: InsightLocale = 'th',
): Promise<Array<{
  user_id: string;
  user_display_name: string | null;
  answered: number;
    missed: number;
    gap_tags: string[];
    headline: string | null;
  suggestion: string | null;
}>> {
  const layered = await hasLayeredAnalyticsSchema();

  const perPlayer = await queryWithRetry<{
    user_id: string;
    user_display_name: string | null;
    answered: number;
    missed: number;
    gap_tags: string[];
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (ua.session_id, ua.user_id, ua.question_id)
              ua.user_id, ua.question_id, ua.utility_score
              ${layered ? ', c.clinical_tags' : ''}
       FROM user_answers ua
       ${layered ? 'LEFT JOIN choices c ON c.question_id = ua.question_id AND c.label = ua.chosen_label' : ''}
       JOIN questions q ON q.id = ua.question_id
       WHERE q.session_id = $1
       ORDER BY ua.session_id, ua.user_id, ua.question_id, ua.answered_at DESC
     ),
     tallies AS (
       SELECT user_id,
              COUNT(*)::int AS answered,
              COUNT(*) FILTER (WHERE utility_score <= 0)::int AS missed
       FROM latest GROUP BY user_id
     ),
     tags AS (
       ${layered
         ? `SELECT user_id, ARRAY_AGG(tag ORDER BY n DESC, tag ASC) AS gap_tags
            FROM (
              SELECT l.user_id, t.tag, COUNT(*)::int AS n
              FROM latest l
              CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(l.clinical_tags, '[]'::jsonb)) AS t(tag)
              WHERE l.utility_score <= 0
              GROUP BY l.user_id, t.tag
            ) counted GROUP BY user_id`
         : `SELECT NULL::text AS user_id, ARRAY[]::text[] AS gap_tags WHERE FALSE`}
     )
     SELECT t.user_id,
            MAX(le.user_display_name) AS user_display_name,
            MAX(t.answered) AS answered,
            MAX(t.missed) AS missed,
            COALESCE(MAX(tg.gap_tags), ARRAY[]::text[]) AS gap_tags
     FROM tallies t
     LEFT JOIN tags tg ON tg.user_id = t.user_id
     LEFT JOIN leaderboard_entries le ON le.user_id = t.user_id
     GROUP BY t.user_id
     ORDER BY MAX(t.missed) DESC, t.user_id ASC`,
    [quizId],
  );

  const hasAudience = await hasIntendedAudienceSchema();
  const quiz = await queryWithRetry<{ intended_audience: string | null }>(
    `SELECT ${hasAudience ? 'intended_audience' : "'public' AS intended_audience"} FROM quizzes WHERE id = $1`,
    [quizId],
  );
  const audience = (quiz.rows[0]?.intended_audience ?? 'public') as IntendedAudience;
  const candidates = await getApprovedInsightCandidates({ quizId, audience, locale });

  return perPlayer.rows.map((row) => {
    const picked = pickInsightTemplate(candidates, {
      quizId,
      tags: row.gap_tags ?? [],
    });
    return {
      user_id: row.user_id,
      user_display_name: row.user_display_name,
      answered: row.answered,
      missed: row.missed,
      gap_tags: row.gap_tags ?? [],
      headline: picked?.headline ?? null,
      suggestion: picked?.suggestion ?? null,
    };
  });
}

export async function listInsightTemplates(filters: {
  quizId?: string | null;
  audience?: IntendedAudience;
  locale?: InsightLocale;
  reviewStatus?: InsightReviewStatus;
}): Promise<InsightTemplate[]> {
  if (!(await hasInsightTemplatesSchema())) return [];

  const result = await queryWithRetry<InsightTemplate>(
    `SELECT id, quiz_id, archetype_id, clinical_tag, audience, locale,
            headline, body, suggestion, review_status, source, model,
            created_by, reviewed_by, reviewed_at, updated_at
     FROM insight_templates
     WHERE ($1::uuid IS NULL OR quiz_id = $1)
       AND archetype_id = '*'
       AND ($2::text IS NULL OR audience = $2)
       AND ($3::text IS NULL OR locale = $3)
       AND ($4::text IS NULL OR review_status = $4)
     ORDER BY archetype_id ASC, clinical_tag ASC, locale ASC, updated_at DESC`,
    [
      filters.quizId ?? null,
      filters.audience ?? null,
      filters.locale ?? null,
      filters.reviewStatus ?? null,
    ],
  );

  return result.rows;
}

/**
 * Dashboard rollup: how many players each approved summary is currently
 * reaching, across every published quiz. Built on getQuizInsightBreakdown so
 * the numbers are the same ones the per-quiz screen shows.
 */
export async function getInsightSummaryDistribution(
  locale: InsightLocale = 'th',
): Promise<{
  rows: Array<{ quiz_id: string; quiz_name: string; headline: string; players: number }>;
  playersWithSummary: number;
  playersWithoutSummary: number;
}> {
  if (!(await hasInsightTemplatesSchema())) {
    return { rows: [], playersWithSummary: 0, playersWithoutSummary: 0 };
  }

  const quizzes = await queryWithRetry<{ id: string; name: string }>(
    'SELECT id, name FROM quizzes WHERE is_published = TRUE ORDER BY name ASC',
  );

  const tally = new Map<string, { quiz_id: string; quiz_name: string; headline: string; players: number }>();
  let withSummary = 0;
  let withoutSummary = 0;

  for (const quiz of quizzes.rows) {
    for (const player of await getQuizInsightBreakdown(quiz.id, locale)) {
      if (!player.headline) { withoutSummary += 1; continue; }
      withSummary += 1;
      const key = `${quiz.id}::${player.headline}`;
      const seen = tally.get(key);
      if (seen) seen.players += 1;
      else tally.set(key, { quiz_id: quiz.id, quiz_name: quiz.name, headline: player.headline, players: 1 });
    }
  }

  return {
    rows: [...tally.values()].sort((a, b) => b.players - a.players || a.headline.localeCompare(b.headline)),
    playersWithSummary: withSummary,
    playersWithoutSummary: withoutSummary,
  };
}

/**
 * Create or replace one resolution key. Editing the text always drops the row
 * back to 'draft' — an approval belongs to the wording that was reviewed, not
 * to the slot it sits in.
 */
export async function upsertInsightTemplate(data: {
  quizId: string | null;
  clinicalTag: string;
  audience: IntendedAudience;
  locale: InsightLocale;
  headline: string;
  body: string;
  suggestion: string | null;
  source: 'manual' | 'llm_draft';
  model: string | null;
  createdBy: string;
}): Promise<InsightTemplate> {
  const conflictTarget =
    data.quizId === null
      ? '(archetype_id, clinical_tag, audience, locale) WHERE quiz_id IS NULL'
      : '(quiz_id, archetype_id, clinical_tag, audience, locale) WHERE quiz_id IS NOT NULL';

  const result = await queryWithRetry<InsightTemplate>(
    `INSERT INTO insight_templates
       (quiz_id, archetype_id, clinical_tag, audience, locale,
        headline, body, suggestion, source, model, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT ${conflictTarget} DO UPDATE SET
       headline = EXCLUDED.headline,
       body = EXCLUDED.body,
       suggestion = EXCLUDED.suggestion,
       source = EXCLUDED.source,
       model = EXCLUDED.model,
       review_status = 'draft',
       reviewed_by = NULL,
       reviewed_at = NULL,
       updated_at = now()
     RETURNING id, quiz_id, archetype_id, clinical_tag, audience, locale,
               headline, body, suggestion, review_status, source, model,
               created_by, reviewed_by, reviewed_at, updated_at`,
    [
      data.quizId,
      '*',
      data.clinicalTag,
      data.audience,
      data.locale,
      data.headline,
      data.body,
      data.suggestion,
      data.source,
      data.model,
      data.createdBy,
    ],
    { allowWriteRetry: true },
  );

  return result.rows[0];
}

export async function reviewInsightTemplate(
  id: string,
  reviewStatus: InsightReviewStatus,
  reviewerUid: string,
): Promise<InsightTemplate | null> {
  const result = await queryWithRetry<InsightTemplate>(
    `UPDATE insight_templates
     SET review_status = $2,
         reviewed_by = CASE WHEN $2 = 'draft' THEN NULL ELSE $3 END,
         reviewed_at = CASE WHEN $2 = 'draft' THEN NULL ELSE now() END,
         updated_at = now()
     WHERE id = $1
     RETURNING id, quiz_id, archetype_id, clinical_tag, audience, locale,
               headline, body, suggestion, review_status, source, model,
               created_by, reviewed_by, reviewed_at, updated_at`,
    [id, reviewStatus, reviewerUid],
    { allowWriteRetry: true },
  );

  return result.rows[0] ?? null;
}

export async function deleteInsightTemplate(id: string): Promise<boolean> {
  const result = await queryWithRetry('DELETE FROM insight_templates WHERE id = $1', [id], {
    allowWriteRetry: true,
  });
  return (result.rowCount ?? 0) > 0;
}

/**
 * The authored material a draft is allowed to draw on: the quiz blurb plus
 * each relevant situation and all of its choices, as the author worded them.
 *
 * Question and choice text exists in every quiz, so this works on any public
 * quiz with no extra authoring. behaviour_meaning is folded in when someone has
 * written it, but is never required. Nothing here comes from a player, which is
 * what keeps the drafting call free of personal data.
 */
export async function getQuizDraftContext(
  quizId: string,
  clinicalTag: string,
  options: { includeAllQuestions?: boolean } = {},
): Promise<{
  quizName: string;
  quizDescription: string | null;
  audience: IntendedAudience;
  scenarios: DraftScenario[];
} | null> {
  const layered = await hasLayeredAnalyticsSchema();
  const hasAudience = await hasIntendedAudienceSchema();

  const quiz = await queryWithRetry<{
    name: string;
    description: string | null;
    intended_audience: string | null;
  }>(
    `SELECT name, description, ${hasAudience ? 'intended_audience' : "'public' AS intended_audience"}
     FROM quizzes WHERE id = $1`,
    [quizId],
  );
  if (!quiz.rows[0]) return null;

  // A tag narrows the questions, not the choices. Once a question is relevant,
  // Gemini needs every option (including the good one) to make a grounded
  // comparison instead of filling the missing answer in from general knowledge.
  const questionFilter = options.includeAllQuestions
    ? ''
    : layered && clinicalTag
    ? `AND EXISTS (
         SELECT 1 FROM choices tagged
         WHERE tagged.question_id = q.id
           AND tagged.score_impact <= 0
           AND COALESCE(tagged.clinical_tags, '[]'::jsonb) ? $2
       )`
    : 'AND EXISTS (SELECT 1 FROM choices poor WHERE poor.question_id = q.id AND poor.score_impact <= 0)';

  const rows = await queryWithRetry<{
    question_text: string;
    choice_text: string;
    behavior_meaning: string | null;
    score_impact: number;
  }>(
    `SELECT q.question_text, c.choice_text, c.score_impact,
            ${layered ? 'c.behavior_meaning' : 'NULL AS behavior_meaning'}
     FROM choices c
     JOIN questions q ON q.id = c.question_id
     WHERE q.session_id = $1
       ${questionFilter}
     ORDER BY q.question_order ASC, c.label ASC`,
    layered && clinicalTag ? [quizId, clinicalTag] : [quizId],
  );

  const byQuestion = new Map<string, DraftScenario>();
  for (const row of rows.rows) {
    const scenario = byQuestion.get(row.question_text) ?? {
      question: row.question_text,
      choices: [],
    };
    scenario.choices.push({
      text: row.choice_text,
      outcome: row.score_impact > 0 ? 'aligned' : 'off_target',
      meaning: row.behavior_meaning,
    });
    byQuestion.set(row.question_text, scenario);
  }

  return {
    quizName: quiz.rows[0].name,
    quizDescription: quiz.rows[0].description,
    audience: (quiz.rows[0].intended_audience ?? 'public') as IntendedAudience,
    scenarios: [...byQuestion.values()],
  };
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
    [quizId, userId, entry?.id || null, null, isPrivate, name || null, SESSION_STATUS.CLOSED]
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

const ALLOWED_SESSION_FIELDS: ReadonlySet<string> = new Set([
  'current_question_id', 'current_score', 'current_streak', 'finished_at',
  'status', 'pin_code', 'name',
]);

export async function updateSession(playSessionId: string, data: Partial<{
  current_question_id: string;
  current_score: number;
  current_streak: number;
  finished_at: string;
  status: SessionStatus;
  pin_code: string | null;
  name: string | null;
  slug: string;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_SESSION_FIELDS.has(key)) continue;
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

// ===================== Consent =====================

export type UserConsentRecord = {
  tos_version: string;
  privacy_version: string;
  consent_purposes: Partial<ConsentPurposes>;
};

export async function getUserConsent(uid: string): Promise<UserConsentRecord | null> {
  const result = await queryWithRetry(
    `SELECT tos_version, privacy_version, consent_purposes
     FROM user_consents WHERE uid = $1`,
    [uid],
  );
  return (result.rows[0] as UserConsentRecord | undefined) ?? null;
}

// Re-consent replaces the whole record, including the proof fields.
export async function upsertUserConsent(data: UserConsentRecord & {
  uid: string;
  ip_address: string;
  user_agent: string;
}) {
  await pool.query(
    `INSERT INTO user_consents (
       uid, tos_version, privacy_version, consent_purposes, ip_address, user_agent, consented_at
     )
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
     ON CONFLICT (uid) DO UPDATE SET
       tos_version = EXCLUDED.tos_version,
       privacy_version = EXCLUDED.privacy_version,
       consent_purposes = EXCLUDED.consent_purposes,
       ip_address = EXCLUDED.ip_address,
       user_agent = EXCLUDED.user_agent,
       consented_at = NOW()`,
    [
      data.uid,
      data.tos_version,
      data.privacy_version,
      JSON.stringify(data.consent_purposes),
      data.ip_address,
      data.user_agent,
    ],
  );
}

// ===================== Leaderboard =====================

export async function getLeaderboard(sessionId: string, viewerUid?: string) {
  const result = await pool.query(
    `SELECT * FROM leaderboard_entries WHERE session_id = $1 ORDER BY total_score DESC`,
    [sessionId]
  );

  // This feeds the public (no admin gate) leaderboard routes. Enforce the
  // public masking — display names are shown, photos and raw uids are
  // masked. is_me is flagged before
  // masking, while user_id is still the real uid.
  return result.rows
    .map((row) => maskPublicLeaderboardEntry({ ...row, is_me: !!viewerUid && row.user_id === viewerUid }))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map((row) => toPublicLeaderboardEntry(row));
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
    `INSERT INTO leaderboard_entries (
           session_id, user_id, user_display_name, user_photo_url, total_score,
           correct_count, incorrect_count, unanswered_count, streak, total_time_ms
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (session_id, user_id) 
         DO UPDATE SET
           total_score = $5,
           correct_count = $6,
           incorrect_count = $7,
           unanswered_count = $8,
           streak = $9,
           total_time_ms = $10,
           completed_at = NOW()
         RETURNING *`,
    [
          data.session_id,
          data.user_id,
          data.user_display_name,
          data.user_photo_url || null,
          data.total_score,
          data.correct_count,
          data.incorrect_count,
          data.unanswered_count,
          data.streak,
          data.total_time_ms,
        ]
  );
  return result.rows[0];
}

export async function getSessionById(id: string) {
  const result = await queryWithRetry(
    `SELECT s.*, 
       q.name as quiz_name, 
       s.name as raw_session_name,
       COALESCE(s.name, q.name) as name,
       q.description as description,
       q.cover_image_url as cover_image_url,
       q.share_token as share_token,
       q.timer_seconds as timer_seconds,
       (SELECT COUNT(*) FROM questions q2 WHERE q2.session_id = q.id)::int AS question_count,
       p.display_name as user_name
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     WHERE s.id::text = $1 OR s.slug = $1`,
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

  const layered = await hasLayeredAnalyticsSchema();
  const actualId = session.id;

  const leaderboardResult = await pool.query(
    `SELECT le.*, p.photo_url as profile_photo 
     FROM leaderboard_entries le
     LEFT JOIN profiles p ON le.user_id = p.uid
     WHERE le.session_id = $1 
     ORDER BY le.total_score DESC`,
    [actualId]
  );

  const questionsResult = await pool.query(
    `SELECT 
       q.id,
       q.question_text,
       q.question_order,
       q.node_type,
       (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1)::int as total_responses,
       (SELECT COALESCE(SUM(utility_score), 0)::int FROM user_answers WHERE question_id = q.id AND session_id = $1) as total_utility_score,
       (SELECT COALESCE(AVG(time_taken_ms), 0)::int FROM user_answers WHERE question_id = q.id AND session_id = $1) as avg_time_ms,
       COALESCE((
         SELECT json_agg(json_build_object(
           'label', c.label,
           'text', c.choice_text,
           'score_impact', c.score_impact,
           'count', (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1 AND chosen_label = c.label)::int
           ${layered ? ", 'behavior_meaning', c.behavior_meaning, 'clinical_tags', c.clinical_tags" : ''}
         ) ORDER BY c.label)
         FROM choices c
         WHERE c.question_id = q.id
       ), '[]'::json) as choices
     FROM questions q
     WHERE q.session_id = (SELECT session_id FROM sessions WHERE id = $1)
     ORDER BY q.question_order ASC`,
    [actualId]
  );

  const individualAnswersResult = await pool.query(
    `SELECT DISTINCT ON (ua.user_id, ua.question_id)
       ua.user_id,
       ua.question_id,
       ua.chosen_label,
       ua.time_taken_ms,
       ua.utility_score,
       ua.utility_score > 0 AS is_correct
     FROM user_answers ua
     WHERE ua.session_id = $1
       AND ua.user_id IS NOT NULL
     ORDER BY ua.user_id, ua.question_id, ua.answered_at DESC, ua.id DESC`,
    [actualId],
  );

  const responsesByQuestion = new Map<string, Record<string, {
    selectedOption: string;
    isCorrect: boolean;
    utilityScore: number;
    timeSeconds: number;
  }>>();
  individualAnswersResult.rows.forEach((answer) => {
    const questionId = String(answer.question_id);
    const userId = String(answer.user_id);
    const responses = responsesByQuestion.get(questionId) ?? {};
    responses[userId] = {
      selectedOption: String(answer.chosen_label ?? ''),
      isCorrect: Boolean(answer.is_correct),
      utilityScore: Number(answer.utility_score) || 0,
      timeSeconds: Math.round((Number(answer.time_taken_ms) || 0) / 1000),
    };
    responsesByQuestion.set(questionId, responses);
  });

  // Admin-only: rows are returned unmasked (every participant, real identity).
  const leaderboard = leaderboardResult.rows;

  const questions = questionsResult.rows.map((row) => {
    const hydrated = hydrateQuestionRow({
      ...row,
      choices: Array.isArray(row.choices) ? row.choices : [],
    });
    const totalResponses = (row.total_responses as number) ?? 0;
    const maxChoiceCount = Array.isArray(hydrated.choices)
      ? Math.max(
          0,
          ...hydrated.choices.map((choice: Record<string, unknown>) => Number(choice.count ?? 0)),
        )
      : 0;
    const divergenceRate =
      totalResponses > 0 ? Number((1 - maxChoiceCount / totalResponses).toFixed(4)) : 0;
    const nodeFrictionScore = Math.round(
      Math.min(100, divergenceRate * 60 + Math.min(40, ((row.avg_time_ms as number) ?? 0) / 1500)),
    );

    return {
      ...hydrated,
      total_responses: totalResponses,
      total_utility_score: Number(row.total_utility_score) || 0,
      avg_time_ms: (row.avg_time_ms as number) ?? 0,
      divergence_rate: divergenceRate,
      node_friction_score: nodeFrictionScore,
      content_quality_flag: 'shared_ready',
      user_responses: responsesByQuestion.get(String(row.id)) ?? {},
    };
  });

  const insights = {
    audience_mode_summary: {
      shared: questions.length,
      adapted: 0,
      distinct: 0,
    },
    highest_friction_nodes: questions
      .map((question) => ({
        question_id: question.id,
        question_text: question.question_text,
        node_friction_score: question.node_friction_score,
      }))
      .sort((a, b) => b.node_friction_score - a.node_friction_score)
      .slice(0, 5),
  };

  return {
    session,
    leaderboard,
    questions,
    insights,
  };
}

export async function getPeerSessionsForQuiz(currentSessionId: string, quizId: string) {
  try {
    const res = await pool.query(
      `SELECT 
         s.id,
         s.name,
         s.pin_code,
         s.status,
         s.started_at,
         s.finished_at AS ended_at,
         (SELECT COUNT(*) FROM leaderboard_entries le WHERE le.session_id = s.id)::int as participant_count,
         (SELECT COALESCE(AVG(total_score), 0)::int FROM leaderboard_entries le WHERE le.session_id = s.id) as avg_score
       FROM sessions s
       WHERE s.session_id = $1 AND s.id::text != $2::text
       ORDER BY s.started_at DESC
       LIMIT 10`,
      [quizId, currentSessionId]
    );
    return res.rows;
  } catch (err) {
    console.error('Failed to get peer sessions for quiz:', err);
    return [];
  }
}

export async function getSessionsByQuizId(quizId: string) {
  try {
    const res = await pool.query(
      `SELECT 
         s.id,
         s.name,
         s.pin_code,
         s.status,
         s.started_at,
         s.finished_at AS ended_at,
         s.created_at,
         s.is_private,
         (SELECT COUNT(*) FROM leaderboard_entries le WHERE le.session_id = s.id)::int as participant_count,
         (SELECT COALESCE(AVG(total_score), 0)::int FROM leaderboard_entries le WHERE le.session_id = s.id) as avg_score
       FROM sessions s
       WHERE s.session_id = $1
       ORDER BY s.started_at DESC`,
      [quizId]
    );
    return res.rows;
  } catch (err) {
    console.error('Failed to get sessions for quiz:', err);
    return [];
  }
}
