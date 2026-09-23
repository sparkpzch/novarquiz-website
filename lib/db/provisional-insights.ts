import pool, { queryWithRetry } from './postgres';
import type { InsightLocale, InsightSummary } from '../analytics/insights';

export type AnswerReviewItem = {
  question: string;
  selected: string;
  selectedExplanation: string | null;
  selectedAligned: boolean;
  alignedChoices: Array<{ text: string; explanation: string | null }>;
};

export type AnswerReviewContext = {
  quizName: string;
  quizDescription: string | null;
  answers: AnswerReviewItem[];
};

export type ProvisionalStatus = 'generating' | 'provisional' | 'approved' | 'rejected' | 'failed';
export type ProvisionalInsight = InsightSummary & {
  id: string;
  quiz_id: string;
  quiz_name: string;
  audience: 'public' | 'hcp';
  locale: InsightLocale;
  answer_signature: string;
  answer_context: AnswerReviewContext | null;
  status: ProvisionalStatus;
  model: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

let schemaPromise: Promise<boolean> | null = null;

async function hasSchema(): Promise<boolean> {
  if (schemaPromise) return schemaPromise;
  const probe = pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'provisional_insight_summaries'
         AND column_name = 'answer_signature'
     ) AS "exists"`,
  ).then((result) => result.rows[0]?.exists ?? false).catch(() => false);
  if (await probe) schemaPromise = probe;
  return probe;
}

type InsightRow = Omit<ProvisionalInsight, 'quiz_name'>;

/** Authenticated caller supplies the user ID; only authored choice text and
 * explanations leave this function. The ID never enters the model prompt. */
export async function getUserAnswerReviewContext(userId: string, quizId: string): Promise<AnswerReviewContext | null> {
  const result = await queryWithRetry<{
    quiz_name: string;
    quiz_description: string | null;
    question_text: string;
    selected_text: string;
    selected_explanation: string | null;
    selected_aligned: boolean;
    aligned_choices: AnswerReviewItem['alignedChoices'];
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (ua.question_id) ua.question_id, ua.chosen_label
       FROM user_answers ua
       JOIN questions q ON q.id = ua.question_id
       WHERE ua.user_id = $1 AND q.session_id = $2
       ORDER BY ua.question_id, ua.answered_at DESC, ua.id DESC
     )
     SELECT quiz.name AS quiz_name, quiz.description AS quiz_description,
            q.question_text, chosen.choice_text AS selected_text,
            chosen.explanation AS selected_explanation,
            (chosen.score_impact > 0) AS selected_aligned,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('text', correct.choice_text, 'explanation', correct.explanation)
                               ORDER BY correct.label)
              FROM choices correct
              WHERE correct.question_id = q.id AND correct.score_impact > 0
            ), '[]'::jsonb) AS aligned_choices
     FROM latest
     JOIN questions q ON q.id = latest.question_id
     JOIN quizzes quiz ON quiz.id = q.session_id AND quiz.is_published = TRUE
     JOIN choices chosen ON chosen.question_id = q.id AND chosen.label = latest.chosen_label
     ORDER BY q.question_order, q.id
     LIMIT 20`,
    [userId, quizId],
  );
  if (result.rows.length === 0) return null;
  return {
    quizName: result.rows[0].quiz_name,
    quizDescription: result.rows[0].quiz_description,
    answers: result.rows.map((row) => ({
      question: row.question_text,
      selected: row.selected_text,
      selectedExplanation: row.selected_explanation,
      selectedAligned: row.selected_aligned,
      alignedChoices: row.aligned_choices ?? [],
    })),
  };
}

export async function getProvisionalInsight(
  quizId: string,
  audience: 'public' | 'hcp',
  locale: InsightLocale,
  answerSignature: string,
): Promise<InsightRow | null> {
  if (!(await hasSchema())) return null;
  const result = await queryWithRetry<InsightRow>(
    `SELECT p.id, p.quiz_id, p.audience, p.locale, p.answer_signature, p.answer_context, p.status,
            p.headline, p.body, p.suggestion, p.model,
            p.reviewed_by, p.reviewed_at, p.updated_at
     FROM provisional_insight_summaries p
     JOIN quizzes q ON q.id = p.quiz_id
     WHERE p.quiz_id = $1 AND p.audience = $2 AND p.locale = $3 AND p.answer_signature = $4
       AND q.is_published = TRUE
       AND p.status IN ('provisional', 'approved')
       AND p.headline IS NOT NULL AND p.body IS NOT NULL`,
    [quizId, audience, locale, answerSignature],
  );
  return result.rows[0] ?? null;
}

/** Claim a single model call across app instances; rejected rows never retry. */
export async function claimProvisionalInsight(
  quizId: string,
  audience: 'public' | 'hcp',
  locale: InsightLocale,
  answerSignature: string,
  answerContext: AnswerReviewContext,
): Promise<{ id: string; claim_token: string } | null> {
  if (!(await hasSchema())) return null;
  const result = await queryWithRetry<{ id: string; claim_token: string }>(
    `INSERT INTO provisional_insight_summaries (quiz_id, audience, locale, answer_signature, answer_context)
     SELECT id, $2, $3, $4, $5::jsonb FROM quizzes WHERE id = $1 AND is_published = TRUE
     ON CONFLICT (quiz_id, audience, locale, answer_signature) DO UPDATE SET
       status = 'generating', claim_token = uuid_generate_v4(),
       answer_context = EXCLUDED.answer_context, updated_at = now()
     WHERE (provisional_insight_summaries.status = 'failed'
              AND provisional_insight_summaries.updated_at < now() - interval '15 minutes')
        OR (provisional_insight_summaries.status = 'generating'
              AND provisional_insight_summaries.updated_at < now() - interval '1 minute')
     RETURNING id, claim_token`,
    [quizId, audience, locale, answerSignature, JSON.stringify(answerContext)],
    { allowWriteRetry: true },
  );
  return result.rows[0] ?? null;
}

export async function finishProvisionalInsight(
  id: string,
  claimToken: string,
  summary: InsightSummary,
  model: string,
): Promise<boolean> {
  const result = await queryWithRetry(
    `UPDATE provisional_insight_summaries p
     SET status = 'provisional', headline = $3, body = $4,
         suggestion = $5, model = $6, updated_at = now()
     WHERE p.id = $1 AND p.claim_token = $2 AND p.status = 'generating'
       AND EXISTS (SELECT 1 FROM quizzes q WHERE q.id = p.quiz_id AND q.is_published = TRUE)`,
    [id, claimToken, summary.headline, summary.body, summary.suggestion, model],
    { allowWriteRetry: true },
  );
  return (result.rowCount ?? 0) > 0;
}

export async function failProvisionalInsight(id: string, claimToken: string): Promise<void> {
  await queryWithRetry(
    `UPDATE provisional_insight_summaries
     SET status = 'failed', updated_at = now()
     WHERE id = $1 AND claim_token = $2 AND status = 'generating'`,
    [id, claimToken],
    { allowWriteRetry: true },
  );
}

export async function listProvisionalInsights(): Promise<ProvisionalInsight[]> {
  if (!(await hasSchema())) return [];
  const result = await queryWithRetry<ProvisionalInsight>(
    `SELECT p.id, p.quiz_id, q.name AS quiz_name, p.audience, p.locale,
            p.answer_signature, p.answer_context,
            p.status, p.headline, p.body, p.suggestion, p.model,
            p.reviewed_by, p.reviewed_at, p.updated_at
     FROM provisional_insight_summaries p
     JOIN quizzes q ON q.id = p.quiz_id
     WHERE p.status IN ('provisional', 'approved', 'rejected')
     ORDER BY CASE p.status WHEN 'provisional' THEN 0 ELSE 1 END,
              p.updated_at DESC`,
  );
  return result.rows;
}

export async function reviewProvisionalInsight(
  id: string,
  status: 'approved' | 'rejected',
  reviewerUid: string,
): Promise<ProvisionalInsight | null> {
  if (!(await hasSchema())) return null;
  const result = await queryWithRetry<ProvisionalInsight>(
    `UPDATE provisional_insight_summaries p
     SET status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     FROM quizzes q
     WHERE p.id = $1 AND q.id = p.quiz_id
       AND p.status IN ('provisional', 'approved', 'rejected')
     RETURNING p.id, p.quiz_id, q.name AS quiz_name, p.audience, p.locale,
               p.answer_signature, p.answer_context,
               p.status, p.headline, p.body, p.suggestion, p.model,
               p.reviewed_by, p.reviewed_at, p.updated_at`,
    [id, status, reviewerUid],
    { allowWriteRetry: true },
  );
  return result.rows[0] ?? null;
}
