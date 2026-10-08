import pool from './postgres';
import { getScopedDbClient } from './query-context';
import { hasBothInsightLanguages, insightGroupKey } from '../analytics/insight-groups';
import { validateInsightLanguage, type InsightSummary } from '../analytics/insights';
import type { ProvisionalInsight } from './provisional-insights';

export type InsightGroupChange = { id: string; expectedRevision: string; summary?: InsightSummary };

/** Lock the complete evidence group; a stale translation must never leave a
 * half-approved bilingual summary. No automatic write retry after commit. */
export async function reviewInsightGroup(
  changes: InsightGroupChange[], status: 'approved' | 'rejected' | 'draft', reviewerUid: string,
  disposition?: 'keep' | 'delete',
): Promise<ProvisionalInsight[] | null> {
  const scoped = getScopedDbClient();
  const client = scoped ?? await pool.connect();
  const boundary = scoped ? 'insight_group_review' : null;
  try {
    await client.query(boundary ? `SAVEPOINT ${boundary}` : 'BEGIN');
    const ids = changes.map(change => change.id);
    const result = await client.query<ProvisionalInsight>(
      `SELECT p.*, p.claim_token AS revision, q.name AS quiz_name
       FROM provisional_insight_summaries p JOIN quizzes q ON q.id = p.quiz_id
       WHERE p.id = ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF p`, [ids],
    );
    const rows = result.rows;
    const valid = new Set(ids).size === ids.length && rows.length === changes.length &&
      rows.every(row => row.revision === changes.find(change => change.id === row.id)?.expectedRevision &&
        ['provisional', 'approved', 'rejected'].includes(row.status) && row.headline && row.body &&
        insightGroupKey(row) === insightGroupKey(rows[0])) &&
      (status !== 'approved' || hasBothInsightLanguages(rows));
    if (!valid) {
      await client.query(boundary ? `ROLLBACK TO SAVEPOINT ${boundary}` : 'ROLLBACK');
      if (boundary) await client.query(`RELEASE SAVEPOINT ${boundary}`);
      return null;
    }
    // Validate each language after looking up its trusted locale in the database.
    if (changes.some(change => {
      const row = rows.find(row => row.id === change.id)!;
      return (status === 'approved' || !!change.summary) && !validateInsightLanguage(change.summary ?? row, row.locale);
    })) {
      await client.query(boundary ? `ROLLBACK TO SAVEPOINT ${boundary}` : 'ROLLBACK');
      if (boundary) await client.query(`RELEASE SAVEPOINT ${boundary}`);
      return null;
    }
    const updated: ProvisionalInsight[] = [];
    for (const change of [...changes].sort((a, b) => a.id.localeCompare(b.id))) {
      const row = rows.find(row => row.id === change.id)!;
      const summary = change.summary ?? row;
      const deleting = status === 'rejected' && disposition === 'delete';
      const next = await client.query<ProvisionalInsight>(
        `UPDATE provisional_insight_summaries p
         SET status = $2, reviewed_by = $3, reviewed_at = CASE WHEN $9 THEN NULL ELSE now() END,
             updated_at = now(), claim_token = uuid_generate_v4(),
             answer_signature = CASE WHEN $2 = 'rejected' AND NOT $7 THEN $8 ELSE p.answer_signature END,
             headline = CASE WHEN $7 THEN NULL ELSE $4 END, body = CASE WHEN $7 THEN NULL ELSE $5 END,
             suggestion = CASE WHEN $7 THEN NULL ELSE $6 END
         FROM quizzes q WHERE p.id = $1 AND q.id = p.quiz_id
         RETURNING p.*, p.claim_token AS revision, q.name AS quiz_name`,
        [change.id, status === 'draft' ? (row.status === 'rejected' ? 'rejected' : 'provisional') : status,
          status === 'draft' ? null : reviewerUid, summary.headline, summary.body, summary.suggestion, deleting,
          !rows[0].answer_context?.answers.length ? `retained-group:${insightGroupKey(rows[0]).slice(7)}:${row.id}` : `retained:${row.id}`, status === 'draft'],
      );
      updated.push(next.rows[0]);
    }
    await client.query(boundary ? `RELEASE SAVEPOINT ${boundary}` : 'COMMIT');
    return updated;
  } catch (error) {
    await client.query(boundary ? `ROLLBACK TO SAVEPOINT ${boundary}` : 'ROLLBACK');
    if (boundary) await client.query(`RELEASE SAVEPOINT ${boundary}`);
    throw error;
  } finally { if (!scoped) client.release(); }
}
