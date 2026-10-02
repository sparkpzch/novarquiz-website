import pool from './postgres';
import { SURVEY_VERSION, SurveySchema, summarizeSurveys, type SurveyInput, type SurveyRecord } from '../onboarding/survey';

export async function getParticipantSurvey(uid: string): Promise<SurveyRecord | null> {
  const result = await pool.query(`SELECT first_name AS "firstName", last_name AS "lastName", age, gender,
    weight_kg::float8 AS "weightKg", height_cm::float8 AS "heightCm", activity,
    analytics_consent AS "analyticsConsent", survey_version AS version FROM participant_surveys WHERE uid=$1`, [uid]);
  return result.rows[0] ?? null;
}

export async function saveParticipantSurvey(uid: string, s: SurveyInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO profiles(uid,display_name,last_seen) VALUES($1,$2,now())
      ON CONFLICT(uid) DO UPDATE SET display_name=EXCLUDED.display_name,last_seen=now()`, [uid, `${s.firstName} ${s.lastName}`]);
    await client.query(`INSERT INTO participant_surveys(uid,first_name,last_name,age,gender,weight_kg,height_cm,activity,analytics_consent,survey_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(uid) DO UPDATE SET
      first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,age=EXCLUDED.age,gender=EXCLUDED.gender,
      weight_kg=EXCLUDED.weight_kg,height_cm=EXCLUDED.height_cm,activity=EXCLUDED.activity,
      analytics_consent=EXCLUDED.analytics_consent,survey_version=EXCLUDED.survey_version,updated_at=now()`,
      [uid,s.firstName,s.lastName,s.age,s.gender,s.weightKg,s.heightCm,s.activity,s.analyticsConsent,SURVEY_VERSION]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function getDemographics(scope: { sessionId?: string; quizId?: string } = {}) {
  // DISTINCT profiles avoid counting the same person repeatedly across quiz attempts.
  const values = scope.sessionId ? [scope.sessionId] : scope.quizId ? [scope.quizId] : [];
  const filter = scope.sessionId ? 'le.session_id::text=$1' : scope.quizId ? 'sessions.session_id::text=$1' : '';
  const people = filter ? `SELECT DISTINCT p.uid FROM profiles p JOIN leaderboard_entries le ON le.user_id=p.uid
    JOIN sessions ON sessions.id::text=le.session_id::text WHERE ${filter}` : 'SELECT uid FROM profiles';
  const result = await pool.query(`WITH people AS (${people}) SELECT s.uid,
    s.first_name AS "firstName",s.last_name AS "lastName",s.age,s.gender,s.weight_kg::float8 AS "weightKg",
    s.height_cm::float8 AS "heightCm",s.activity,s.analytics_consent AS "analyticsConsent"
    FROM people p LEFT JOIN participant_surveys s ON s.uid=p.uid AND s.survey_version=$${values.length+1}`, [...values,SURVEY_VERSION]);
  const surveys = result.rows.flatMap(row => { const parsed=SurveySchema.safeParse({firstName:row.firstName,lastName:row.lastName,age:row.age,gender:row.gender,weightKg:row.weightKg,heightCm:row.heightCm,activity:row.activity,analyticsConsent:row.analyticsConsent}); return parsed.success ? [parsed.data] : []; });
  return summarizeSurveys(result.rows.length, surveys);
}
