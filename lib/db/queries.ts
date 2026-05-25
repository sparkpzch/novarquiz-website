import { randomUUID } from 'node:crypto';
import pool, { queryWithRetry } from './postgres';
import { SESSION_STATUS, SessionStatus } from '../constants/session';
import { incrementMediaUsage, decrementMediaUsage, syncMediaUsage } from './media';
import {
  accumulateVectors,
  classifyArchetype,
  DEFAULT_CHOICE_METADATA,
  DEFAULT_QUESTION_METADATA,
  emptyHcpVectorMap,
  mostExpressiveVector,
  normalizeChoiceMetadata,
  normalizeProfileVectors,
  normalizeQuestionMetadata,
  normalizeVectorMap,
  type AllowedUsage,
  type HcpVectorMap,
} from '../analytics/hcp';

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

export async function getAllSessions(visibleToUid?: string) {
  const where = visibleToUid ? `WHERE (s.is_private = FALSE OR s.user_id = $1)` : '';
  const params = visibleToUid ? [visibleToUid] : [];
  const result = await queryWithRetry(
    `SELECT s.*,
      q.name as quiz_name,
      s.name as raw_session_name,
      COALESCE(s.name, q.name) as name,
      q.description as description,
      q.cover_image_url as cover_image_url,
      q.share_token as share_token,
      COALESCE(p.display_name, (SELECT user_display_name FROM leaderboard_entries le WHERE le.user_id = s.user_id LIMIT 1)) as user_name,
      (SELECT COUNT(*) FROM questions q2 WHERE q2.session_id = q.id)::int AS question_count,
      (SELECT COUNT(*) FROM leaderboard_entries le WHERE le.session_id::text = s.id::text)::int AS play_count,
      (SELECT COALESCE(ROUND(AVG(le.total_score)), 0) FROM leaderboard_entries le WHERE le.session_id::text = s.id::text)::int AS avg_score
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     ${where}
     ORDER BY s.started_at DESC`,
    params,
  );
  return result.rows;
}

const SESSION_TOKEN_SELECT = `
  SELECT s.*,
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
  LEFT JOIN profiles p ON s.user_id = p.uid`;

// Accepting UUID and PIN in a single OR query conflates two fundamentally
// different identifier types (high-entropy UUID vs. short numeric PIN) and
// makes the PIN brute-forceable via the same rate-limited endpoint. Route each
// token type to its own lookup so the two surfaces cannot be cross-exploited.
export async function getSessionByToken(token: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isUuid) {
    const result = await queryWithRetry(
      `${SESSION_TOKEN_SELECT} WHERE s.id::text = $1 LIMIT 1`,
      [token],
    );
    return result.rows[0];
  }
  const result = await queryWithRetry(
    `SELECT s.*, 
       q.name as quiz_name, 
       s.name as raw_session_name,
       COALESCE(s.name, q.name) as name,
       q.description as description,
       q.cover_image_url as cover_image_url,
       q.share_token as share_token,
       q.timer_seconds as timer_seconds,
       q.intended_audience as intended_audience,
       q.presentation_mode as presentation_mode,
       q.reading_level as reading_level,
       q.jurisdiction_tags as jurisdiction_tags,
       q.medical_review_version as medical_review_version,
       q.legal_document_versions_required as legal_document_versions_required,
       (SELECT COUNT(*) FROM questions q2 WHERE q2.session_id = q.id)::int AS question_count,
       p.display_name as user_name
     FROM sessions s
     JOIN quizzes q ON s.session_id = q.id
     LEFT JOIN profiles p ON s.user_id = p.uid
     WHERE s.pin_code = $1
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
]);

export async function updateQuiz(sessionId: string, data: Partial<{
  name: string;
  description: string;
  cover_image_url: string;
  cover_image_path: string;
  timer_seconds: number;
  is_published: boolean;
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
        `INSERT INTO questions (
           session_id, question_order, question_text, node_name, intended_audience, presentation_mode,
           reading_level, jurisdiction_tags, medical_review_version, legal_document_versions_required,
           media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
        [
          newSession.id,
          q.question_order,
          q.question_text,
          q.node_name,
          q.intended_audience ?? DEFAULT_QUESTION_METADATA.intended_audience,
          q.presentation_mode ?? DEFAULT_QUESTION_METADATA.presentation_mode,
          q.reading_level ?? null,
          JSON.stringify(q.jurisdiction_tags ?? []),
          q.medical_review_version ?? null,
          JSON.stringify(q.legal_document_versions_required ?? {}),
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
          `INSERT INTO choices (
             question_id, label, choice_text, score_impact, explanation,
             behavior_meaning, vector_deltas, clinical_tags, confidence_weight,
             allowed_usage, requires_hcp_version, review_status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
          [
            newQId,
            c.label,
            c.choice_text,
            c.score_impact,
            c.explanation,
            c.behavior_meaning ?? null,
            JSON.stringify(c.vector_deltas ?? {}),
            JSON.stringify(c.clinical_tags ?? []),
            c.confidence_weight ?? 1,
            c.allowed_usage ?? DEFAULT_CHOICE_METADATA.allowed_usage,
            c.requires_hcp_version ?? false,
            c.review_status ?? DEFAULT_CHOICE_METADATA.review_status,
          ]
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
      COALESCE(json_agg(${buildChoiceJsonSql('c')} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
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

export async function getQuestionById(questionId: string, quizId: string) {
  const result = await queryWithRetry(
    `SELECT q.*, 
      COALESCE(json_agg(${buildChoiceJsonSql('c')} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM questions q
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE q.id = $1 AND q.session_id = $2
     GROUP BY q.id`,
    [questionId, quizId]
  );
  return result.rows[0] ? hydrateQuestionRow(result.rows[0]) : null;
}

export async function getEntryQuestion(id: string) {
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      COALESCE(json_agg(${buildChoiceJsonSql('c')} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM questions q
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE (q.session_id = $1 OR q.session_id = (SELECT session_id FROM sessions WHERE id = $1)) 
       AND q.is_entry_point = TRUE
     GROUP BY q.id, qs.timer_seconds`,
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
  intended_audience?: string;
  presentation_mode?: string;
  reading_level?: string | null;
  jurisdiction_tags?: string[];
  medical_review_version?: string | null;
  legal_document_versions_required?: Record<string, string>;
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
    const questionId = data.id ?? randomUUID();
    const metadata = normalizeQuestionMetadata(data);
    const result = await client.query(
      `INSERT INTO questions (
         id, session_id, question_order, question_text, node_name,
         intended_audience, presentation_mode, reading_level, jurisdiction_tags,
         medical_review_version, legal_document_versions_required,
         media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (id) DO UPDATE SET
         session_id = EXCLUDED.session_id,
         question_order = EXCLUDED.question_order,
         question_text = EXCLUDED.question_text,
         node_name = EXCLUDED.node_name,
         intended_audience = EXCLUDED.intended_audience,
         presentation_mode = EXCLUDED.presentation_mode,
         reading_level = EXCLUDED.reading_level,
         jurisdiction_tags = EXCLUDED.jurisdiction_tags,
         medical_review_version = EXCLUDED.medical_review_version,
         legal_document_versions_required = EXCLUDED.legal_document_versions_required,
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
        metadata.intended_audience,
        metadata.presentation_mode,
        metadata.reading_level,
        JSON.stringify(metadata.jurisdiction_tags),
        metadata.medical_review_version,
        JSON.stringify(metadata.legal_document_versions_required),
        data.media_type || null,
        data.media_url || null,
        data.media_path || null,
        data.timer_override || null,
        data.is_entry_point || false,
        data.node_x || 0,
        data.node_y || 0,
        data.node_type || 'normal',
      ]
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
    'vector_deltas', ${alias}.vector_deltas,
    'clinical_tags', ${alias}.clinical_tags,
    'confidence_weight', ${alias}.confidence_weight,
    'allowed_usage', ${alias}.allowed_usage,
    'requires_hcp_version', ${alias}.requires_hcp_version,
    'review_status', ${alias}.review_status
  )`;
}

function hydrateQuestionRow<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    intended_audience:
      typeof row.intended_audience === 'string'
        ? row.intended_audience
        : DEFAULT_QUESTION_METADATA.intended_audience,
    presentation_mode:
      typeof row.presentation_mode === 'string'
        ? row.presentation_mode
        : DEFAULT_QUESTION_METADATA.presentation_mode,
    reading_level: typeof row.reading_level === 'string' ? row.reading_level : null,
    jurisdiction_tags: parseStringArray(row.jurisdiction_tags),
    medical_review_version:
      typeof row.medical_review_version === 'string' ? row.medical_review_version : null,
    legal_document_versions_required: parseRecord(row.legal_document_versions_required),
    choices: Array.isArray(row.choices)
      ? row.choices.map((choice) => {
          const rawChoice = (choice ?? {}) as Record<string, unknown>;
          const metadata = normalizeChoiceMetadata({
            behavior_meaning:
              typeof rawChoice.behavior_meaning === 'string' ? rawChoice.behavior_meaning : null,
            vector_deltas:
              rawChoice.vector_deltas && typeof rawChoice.vector_deltas === 'object'
                ? (rawChoice.vector_deltas as Partial<Record<string, number>>)
                : undefined,
            clinical_tags: parseStringArray(rawChoice.clinical_tags),
            confidence_weight:
              typeof rawChoice.confidence_weight === 'number' ? rawChoice.confidence_weight : 1,
            allowed_usage:
              typeof rawChoice.allowed_usage === 'string'
                ? (rawChoice.allowed_usage as AllowedUsage)
                : DEFAULT_CHOICE_METADATA.allowed_usage,
            requires_hcp_version: Boolean(rawChoice.requires_hcp_version),
            review_status:
              typeof rawChoice.review_status === 'string'
                ? rawChoice.review_status
                : DEFAULT_CHOICE_METADATA.review_status,
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
  intended_audience?: string;
  presentation_mode?: string;
  reading_level?: string | null;
  jurisdiction_tags?: string[];
  medical_review_version?: string | null;
  legal_document_versions_required?: Record<string, string>;
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
    vector_deltas?: Partial<Record<string, number>>;
    clinical_tags?: string[];
    confidence_weight?: number;
    allowed_usage?: string;
    requires_hcp_version?: boolean;
    review_status?: string;
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
      const questionMetadata = normalizeQuestionMetadata(question);

      await client.query(
        `INSERT INTO questions (
           id, session_id, question_order, question_text, node_name,
           intended_audience, presentation_mode, reading_level, jurisdiction_tags,
           medical_review_version, legal_document_versions_required,
           media_type, media_url, media_path, timer_override, is_entry_point, node_x, node_y, node_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          questionId,
          sessionId,
          question.question_order,
          question.question_text,
          question.node_name ?? null,
          questionMetadata.intended_audience,
          questionMetadata.presentation_mode,
          questionMetadata.reading_level,
          JSON.stringify(questionMetadata.jurisdiction_tags),
          questionMetadata.medical_review_version,
          JSON.stringify(questionMetadata.legal_document_versions_required),
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
          `INSERT INTO choices (
             question_id, label, choice_text, score_impact, explanation,
             behavior_meaning, vector_deltas, clinical_tags, confidence_weight,
             allowed_usage, requires_hcp_version, review_status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
          [
            questionId,
            choice.label,
            choice.choice_text,
            normalizeChoiceScoreImpact(choice),
            choice.explanation ?? null,
            choiceMetadata.behavior_meaning,
            JSON.stringify(choiceMetadata.vector_deltas),
            JSON.stringify(choiceMetadata.clinical_tags),
            choiceMetadata.confidence_weight,
            choiceMetadata.allowed_usage,
            choiceMetadata.requires_hcp_version,
            choiceMetadata.review_status,
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
  explanation?: string;
  behavior_meaning?: string | null;
  vector_deltas?: Partial<Record<string, number>>;
  clinical_tags?: string[];
  confidence_weight?: number;
  allowed_usage?: string;
  requires_hcp_version?: boolean;
  review_status?: string;
}>) {
  // Delete existing choices and insert new ones
  await queryWithRetry('DELETE FROM choices WHERE question_id = $1', [questionId], {
    allowWriteRetry: true,
  });
  for (const choice of choices) {
    const metadata = normalizeChoiceMetadata(choice);
    await queryWithRetry(
      `INSERT INTO choices (
         question_id, label, choice_text, score_impact, explanation,
         behavior_meaning, vector_deltas, clinical_tags, confidence_weight,
         allowed_usage, requires_hcp_version, review_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
       ON CONFLICT (question_id, label) DO UPDATE SET
         choice_text = EXCLUDED.choice_text,
         score_impact = EXCLUDED.score_impact,
         explanation = EXCLUDED.explanation,
         behavior_meaning = EXCLUDED.behavior_meaning,
         vector_deltas = EXCLUDED.vector_deltas,
         clinical_tags = EXCLUDED.clinical_tags,
         confidence_weight = EXCLUDED.confidence_weight,
         allowed_usage = EXCLUDED.allowed_usage,
         requires_hcp_version = EXCLUDED.requires_hcp_version,
         review_status = EXCLUDED.review_status`,
      [
        questionId,
        choice.label,
        choice.choice_text,
        normalizeChoiceScoreImpact(choice),
        choice.explanation ?? null,
        metadata.behavior_meaning,
        JSON.stringify(metadata.vector_deltas),
        JSON.stringify(metadata.clinical_tags),
        metadata.confidence_weight,
        metadata.allowed_usage,
        metadata.requires_hcp_version,
        metadata.review_status,
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

export async function getNextQuestion(fromQuestionId: string, choiceLabel: string, quizId: string) {
  const result = await queryWithRetry(
    `SELECT q.*, qs.timer_seconds AS session_timer_seconds,
      COALESCE(json_agg(${buildChoiceJsonSql('c')} ORDER BY c.label) FILTER (WHERE c.id IS NOT NULL), '[]'::json) as choices
     FROM question_connections qc
     JOIN questions q ON q.id = qc.to_question_id
     JOIN quizzes qs ON qs.id = q.session_id
     LEFT JOIN choices c ON c.question_id = q.id
     WHERE qc.from_question_id = $1 AND qc.from_choice_label = $2 AND qs.id = $3
     GROUP BY q.id, qs.timer_seconds`,
    [fromQuestionId, choiceLabel, quizId]
  );
  return result.rows[0] ? hydrateQuestionRow(result.rows[0]) : null;
}

// ===================== User Answers =====================

// Persists one answer + computes the points server-side from the chosen
// choice's `points` column. Returns the points awarded so the caller can
// surface them in the response (and clients can update RTDB live score).
// Idempotent: a second call for the same (session, user, question) returns
// the existing record without inserting a new row (prevents replay attacks).
export async function saveUserAnswer(data: {
  session_id: string;
  user_id: string;
  question_id: string;
  chosen_label: string;
  time_taken_ms: number;
}): Promise<{
  id: string;
  points_earned: number;
  vector_scores: HcpVectorMap;
  behavior_meaning: string | null;
  allowed_usage: AllowedUsage;
}> {
  const existing = await pool.query(
    `SELECT id, utility_score as points_earned, vector_scores, behavior_meaning_snapshot as behavior_meaning, allowed_usage_snapshot as allowed_usage 
     FROM user_answers 
     WHERE session_id = $1 AND user_id = $2 AND question_id = $3 LIMIT 1`,
    [data.session_id, data.user_id, data.question_id],
  );
  if (existing.rows[0]) {
    return {
      ...existing.rows[0],
      vector_scores: normalizeVectorMap(existing.rows[0].vector_scores),
    } as any;
  }

  // Look up the canonical points for the chosen choice
  const choiceResult = await pool.query(
    `SELECT score_impact, vector_deltas, behavior_meaning, allowed_usage, confidence_weight
     FROM choices
     WHERE question_id = $1 AND label = $2`,
    [data.question_id, data.chosen_label],
  );
  const choice = choiceResult.rows[0] ?? {};
  const points = (choice.score_impact as number | undefined) ?? 0;
  const confidence = typeof choice.confidence_weight === 'number' ? choice.confidence_weight : 1;
  const baseVector = normalizeVectorMap(
    choice.vector_deltas && typeof choice.vector_deltas === 'object'
      ? (choice.vector_deltas as Partial<Record<string, number>>)
      : undefined,
  );
  const weightedVector = emptyHcpVectorMap();
  for (const key of Object.keys(baseVector) as Array<keyof HcpVectorMap>) {
    weightedVector[key] = Number((baseVector[key] * confidence).toFixed(4));
  }
  const behaviorMeaning = typeof choice.behavior_meaning === 'string' ? choice.behavior_meaning : null;
  const allowedUsage =
    typeof choice.allowed_usage === 'string'
      ? (choice.allowed_usage as AllowedUsage)
      : DEFAULT_CHOICE_METADATA.allowed_usage;

  const result = await pool.query(
    `INSERT INTO user_answers (
       session_id, user_id, question_id, chosen_label, time_taken_ms,
       utility_score, vector_scores, behavior_meaning_snapshot, allowed_usage_snapshot
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING id`,
    [
      data.session_id,
      data.user_id,
      data.question_id,
      data.chosen_label,
      data.time_taken_ms,
      points,
      JSON.stringify(weightedVector),
      behaviorMeaning,
      allowedUsage,
    ]
  );
  return {
    id: result.rows[0].id,
    points_earned: points,
    vector_scores: weightedVector,
    behavior_meaning: behaviorMeaning,
    allowed_usage: allowedUsage,
  };
}

export async function getUserCumulativeScore(sessionId: string, userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(utility_score), 0)::int AS total FROM user_answers WHERE session_id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  return (result.rows[0]?.total as number) ?? 0;
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

  const vectorsResult = await pool.query(
    `SELECT vector_scores, allowed_usage_snapshot FROM (
       SELECT DISTINCT ON (question_id) vector_scores, allowed_usage_snapshot, answered_at
       FROM user_answers
       WHERE session_id = $1 AND user_id = $2
       ORDER BY question_id, answered_at DESC
     ) latest_answers`,
    [data.session_id, data.user_id],
  );

  const rawVector = accumulateVectors(
    vectorsResult.rows.map((row) =>
      row.vector_scores && typeof row.vector_scores === 'object'
        ? (row.vector_scores as Partial<Record<string, number>>)
        : undefined,
    ),
  );
  const normalizedVector = normalizeProfileVectors(rawVector);
  const archetypeId = classifyArchetype(normalizedVector);
  const usageSet = new Set(
    vectorsResult.rows.map((row) =>
      typeof row.allowed_usage_snapshot === 'string'
        ? row.allowed_usage_snapshot
        : DEFAULT_CHOICE_METADATA.allowed_usage,
    ),
  );
  const insightClassification = usageSet.has('crm_eligible')
    ? 'identified'
    : usageSet.has('pseudonymous_profile')
      ? 'pseudonymous'
      : 'aggregate';

  await pool.query(
    `INSERT INTO leaderboard_entries
       (session_id, user_id, user_display_name, user_photo_url,
        total_score, correct_count, incorrect_count, unanswered_count, streak, total_time_ms,
        profile_vector_scores, normalized_vector_scores, archetype_id, insight_classification)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10::jsonb, $11::jsonb, $12, $13)
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
       profile_vector_scores = EXCLUDED.profile_vector_scores,
       normalized_vector_scores = EXCLUDED.normalized_vector_scores,
       archetype_id = EXCLUDED.archetype_id,
       insight_classification = EXCLUDED.insight_classification,
       completed_at      = NOW()`,
    [
      data.session_id, data.user_id, data.user_display_name, data.user_photo_url ?? null,
      row.total_score, row.positive_count, row.nonpositive_count, best, row.total_time_ms,
      JSON.stringify(rawVector),
      JSON.stringify(normalizedVector),
      archetypeId,
      insightClassification,
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
    profile_vector_scores: rawVector,
    normalized_vector_scores: normalizedVector,
    archetype_id: archetypeId,
    insight_classification: insightClassification,
  };
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
  profile_vector_scores?: HcpVectorMap;
  normalized_vector_scores?: HcpVectorMap;
  archetype_id?: string | null;
  insight_classification?: 'aggregate' | 'pseudonymous' | 'identified';
}) {
  const result = await pool.query(
    `INSERT INTO leaderboard_entries (
       session_id, user_id, user_display_name, user_photo_url, total_score,
       correct_count, incorrect_count, unanswered_count, streak, total_time_ms,
       profile_vector_scores, normalized_vector_scores, archetype_id, insight_classification
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14)
     ON CONFLICT (session_id, user_id) 
     DO UPDATE SET
       total_score = $5,
       correct_count = $6,
       incorrect_count = $7,
       unanswered_count = $8,
       streak = $9,
       total_time_ms = $10,
       profile_vector_scores = $11::jsonb,
       normalized_vector_scores = $12::jsonb,
       archetype_id = $13,
       insight_classification = $14,
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
      JSON.stringify(data.profile_vector_scores ?? emptyHcpVectorMap()),
      JSON.stringify(data.normalized_vector_scores ?? emptyHcpVectorMap()),
      data.archetype_id ?? null,
      data.insight_classification ?? 'aggregate',
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
       q.intended_audience,
       q.presentation_mode,
       q.reading_level,
       q.jurisdiction_tags,
       q.medical_review_version,
       q.legal_document_versions_required,
       (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1)::int as total_responses,
       (SELECT COALESCE(AVG(time_taken_ms), 0)::int FROM user_answers WHERE question_id = q.id AND session_id = $1) as avg_time_ms,
       COALESCE((
         SELECT json_agg(json_build_object(
           'label', c.label,
           'text', c.choice_text,
           'is_correct', (c.score_impact > 0),
           'count', (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND session_id = $1 AND chosen_label = c.label)::int,
           'behavior_meaning', c.behavior_meaning,
           'vector_deltas', c.vector_deltas,
           'clinical_tags', c.clinical_tags,
           'allowed_usage', c.allowed_usage,
           'review_status', c.review_status
         ) ORDER BY c.label)
         FROM choices c
         WHERE c.question_id = q.id
       ), '[]'::json) as choices
     FROM questions q
     WHERE q.session_id = (SELECT session_id FROM sessions WHERE id = $1)
     ORDER BY q.question_order ASC`,
    [actualId]
  );

  const leaderboard = leaderboardResult.rows.map((row) => ({
    ...row,
    profile_vector_scores: normalizeVectorMap(
      row.profile_vector_scores && typeof row.profile_vector_scores === 'object'
        ? (row.profile_vector_scores as Partial<Record<string, number>>)
        : undefined,
    ),
    normalized_vector_scores: normalizeVectorMap(
      row.normalized_vector_scores && typeof row.normalized_vector_scores === 'object'
        ? (row.normalized_vector_scores as Partial<Record<string, number>>)
        : undefined,
    ),
  }));

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
      avg_time_ms: (row.avg_time_ms as number) ?? 0,
      divergence_rate: divergenceRate,
      node_friction_score: nodeFrictionScore,
      content_quality_flag:
        hydrated.presentation_mode === 'distinct'
          ? 'distinct'
          : hydrated.intended_audience === 'hcp' && !hydrated.medical_review_version
            ? 'needs_medical_review'
            : 'shared_ready',
    };
  });

  const vectorSummary = emptyHcpVectorMap();
  const archetypeCounts: Record<string, number> = {};

  for (const entry of leaderboard) {
    const vectors = normalizeVectorMap(entry.normalized_vector_scores);
    for (const key of Object.keys(vectorSummary) as Array<keyof HcpVectorMap>) {
      vectorSummary[key] += vectors[key];
    }
    const archetype = typeof entry.archetype_id === 'string' ? entry.archetype_id : 'unclassified';
    archetypeCounts[archetype] = (archetypeCounts[archetype] ?? 0) + 1;
  }

  const playerCount = leaderboard.length || 1;
  for (const key of Object.keys(vectorSummary) as Array<keyof HcpVectorMap>) {
    vectorSummary[key] = Math.round(vectorSummary[key] / playerCount);
  }

  const insights = {
    audience_mode_summary: {
      shared: questions.filter((q) => q.presentation_mode === 'shared').length,
      adapted: questions.filter((q) => q.presentation_mode === 'adapted').length,
      distinct: questions.filter((q) => q.presentation_mode === 'distinct').length,
    },
    archetype_distribution: Object.entries(archetypeCounts)
      .map(([archetype_id, count]) => ({ archetype_id, count }))
      .sort((a, b) => b.count - a.count),
    vector_summary: vectorSummary,
    dominant_vector: mostExpressiveVector(vectorSummary),
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
