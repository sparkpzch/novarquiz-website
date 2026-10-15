import pool from './postgres';
import { SURVEY_VERSION, HealthSchema } from '../onboarding/survey';
import { MIN_CELL, type ParticipantRow, type ProvinceFilters } from '../analytics/lscvd';
import type { ProvinceCode } from '../onboarding/provinces';

const AGE_RANGES: Record<NonNullable<ProvinceFilters['age']>, [number, number]> = {
  under18: [0, 17], '18_29': [18, 29], '30_44': [30, 44], '45_59': [45, 59], '60plus': [60, 200],
};

/**
 * Shared SQL for "who is counted": current-version surveys with a province, plus
 * the latest answer per question within the date/quiz filters. Gender and age
 * filters read demographic answers, so they only match people with analytics
 * consent. With a date or quiz filter, only people active in it are counted.
 */
function scope(filters: ProvinceFilters, province?: ProvinceCode) {
  const params: unknown[] = [SURVEY_VERSION];
  const p = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const people = ['s.survey_version=$1', 's.province_code IS NOT NULL', '(s.analytics_consent OR h.uid IS NOT NULL)'];
  if (province) people.push(`s.province_code=${p(province)}`);
  if (filters.gender) people.push(`s.analytics_consent AND s.gender=${p(filters.gender)}`);
  if (filters.age) { const [min, max] = AGE_RANGES[filters.age]; people.push(`s.analytics_consent AND s.age BETWEEN ${p(min)} AND ${p(max)}`); }
  const answers = ['ua.user_id IN (SELECT uid FROM people)'];
  if (filters.from) answers.push(`ua.answered_at >= (${p(filters.from)}::date)::timestamp AT TIME ZONE 'Asia/Bangkok'`);
  if (filters.to) answers.push(`ua.answered_at < (${p(filters.to)}::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'`);
  if (filters.quiz) answers.push(`se.session_id=${p(filters.quiz)}`);
  const activityOnly = Boolean(filters.from || filters.to || filters.quiz);
  const cte = `people AS (
      SELECT s.uid, s.province_code, s.analytics_consent, s.gender, s.weight_kg, s.height_cm, h.uid IS NOT NULL AS has_health,
        h.waist_cm, h.smoking, h.hypertension, h.diabetes, h.high_cholesterol, h.lipid_check, h.ldl_range,
        h.lipid_medication, h.family_history, h.prior_event
      FROM participant_surveys s LEFT JOIN participant_health_profiles h ON h.uid=s.uid
      WHERE ${people.join(' AND ')}
    ), latest AS (
      SELECT DISTINCT ON (ua.user_id, ua.session_id, ua.question_id) ua.user_id, ua.answered_at, ua.utility_score, se.session_id AS quiz_id
      FROM user_answers ua JOIN sessions se ON se.id=ua.session_id
      WHERE ${answers.join(' AND ')}
      ORDER BY ua.user_id, ua.session_id, ua.question_id, ua.answered_at DESC, ua.id DESC
    )`;
  return { cte, params, activityOnly };
}

export async function getParticipantRows(filters: ProvinceFilters, province?: ProvinceCode): Promise<ParticipantRow[]> {
  const { cte, params, activityOnly } = scope(filters, province);
  const result = await pool.query(`WITH ${cte}, scores AS (
      SELECT user_id, COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE utility_score > 0)::int AS positive FROM latest GROUP BY user_id
    )
    SELECT p.*, p.weight_kg::float8 AS weight, p.height_cm::float8 AS height, p.waist_cm::float8 AS waist,
      COALESCE(sc.answered, 0) AS answered, COALESCE(sc.positive, 0) AS positive
    FROM people p LEFT JOIN scores sc ON sc.user_id=p.uid
    ${activityOnly ? 'WHERE sc.answered > 0' : ''}`, params);
  return result.rows.map(r => {
    const health = r.has_health ? HealthSchema.safeParse({
      waistCm: r.waist, smoking: r.smoking, hypertension: r.hypertension, diabetes: r.diabetes, highCholesterol: r.high_cholesterol,
      lipidCheck: r.lipid_check, ldlRange: r.ldl_range, lipidMedication: r.lipid_medication, familyHistory: r.family_history, priorEvent: r.prior_event,
    }) : null;
    return {
      province: r.province_code, analyticsConsent: r.analytics_consent, gender: r.gender,
      weightKg: r.weight, heightCm: r.height, health: health?.success ? health.data : null,
      answered: r.answered, positive: r.positive,
    };
  });
}

export type ProvinceActivity = {
  /** Asia/Bangkok months, oldest first. */
  trend: Array<{ month: string; people: number; answers: number; accuracy: number }>;
  topQuizzes: Array<{ id: string; name: string; people: number; accuracy: number }>;
};

/**
 * Monthly activity and most-played quizzes for one province's consenting
 * participants. Months and quizzes with fewer than MIN_CELL people are left
 * out so a small group cannot be singled out.
 */
export async function getProvinceActivity(province: ProvinceCode, filters: ProvinceFilters): Promise<ProvinceActivity> {
  const { cte, params } = scope(filters, province);
  const consenting = `${cte}, scoped AS (SELECT l.* FROM latest l JOIN people p ON p.uid=l.user_id AND p.analytics_consent)`;
  const minCell = params.push(MIN_CELL);
  const [trend, quizzes] = await Promise.all([
    pool.query(`WITH ${consenting}
      SELECT to_char(date_trunc('month', answered_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
        COUNT(DISTINCT user_id)::int AS people, COUNT(*)::int AS answers,
        ROUND(100.0 * COUNT(*) FILTER (WHERE utility_score > 0) / COUNT(*))::int AS accuracy
      FROM scoped ${filters.from || filters.to ? '' : "WHERE answered_at >= now() - interval '12 months'"}
      GROUP BY 1 HAVING COUNT(DISTINCT user_id) >= $${minCell} ORDER BY 1`, params),
    pool.query(`WITH ${consenting}
      SELECT q.id::text, q.name, COUNT(DISTINCT sc.user_id)::int AS people,
        ROUND(100.0 * COUNT(*) FILTER (WHERE sc.utility_score > 0) / COUNT(*))::int AS accuracy
      FROM scoped sc JOIN quizzes q ON q.id=sc.quiz_id
      GROUP BY q.id, q.name HAVING COUNT(DISTINCT sc.user_id) >= $${minCell}
      ORDER BY people DESC, q.name LIMIT 5`, params),
  ]);
  return { trend: trend.rows, topQuizzes: quizzes.rows };
}
