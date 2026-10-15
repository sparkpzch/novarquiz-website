import pool from './postgres';
import { SURVEY_VERSION, DemographicsSchema, summarizeSurveys, type SurveyInput, type SurveyRecord } from '../onboarding/survey';

export async function getParticipantSurvey(uid: string): Promise<SurveyRecord | null> {
  const result = await pool.query(`SELECT s.first_name AS "firstName", s.last_name AS "lastName", s.age, s.gender,
    s.weight_kg::float8 AS "weightKg", s.height_cm::float8 AS "heightCm", s.activity,
    s.analytics_consent AS "analyticsConsent", s.survey_version AS version, s.province_code AS "provinceCode",
    h.uid IS NOT NULL AS "healthConsent", CASE WHEN h.uid IS NULL THEN NULL ELSE json_build_object(
      'waistCm', h.waist_cm::float8, 'smoking', h.smoking, 'hypertension', h.hypertension, 'diabetes', h.diabetes,
      'highCholesterol', h.high_cholesterol, 'lipidCheck', h.lipid_check, 'ldlRange', h.ldl_range,
      'lipidMedication', h.lipid_medication, 'familyHistory', h.family_history, 'priorEvent', h.prior_event) END AS health
    FROM participant_surveys s LEFT JOIN participant_health_profiles h ON h.uid=s.uid WHERE s.uid=$1`, [uid]);
  const row = result.rows[0];
  if (!row) return null;
  const { provinceCode, ...survey } = row;
  // A NULL province on the current version means "prefer not to say"; on an
  // older version the question was never asked, so the form starts empty.
  return { ...survey, province: provinceCode ?? (row.version === SURVEY_VERSION ? 'prefer_not_to_say' : '') };
}

export async function saveParticipantSurvey(uid: string, s: SurveyInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO profiles(uid,display_name,last_seen) VALUES($1,$2,now())
      ON CONFLICT(uid) DO UPDATE SET display_name=EXCLUDED.display_name,last_seen=now()`, [uid, `${s.firstName} ${s.lastName}`]);
    await client.query(`INSERT INTO participant_surveys(uid,first_name,last_name,age,gender,weight_kg,height_cm,activity,analytics_consent,survey_version,province_code)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(uid) DO UPDATE SET
      first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,age=EXCLUDED.age,gender=EXCLUDED.gender,
      weight_kg=EXCLUDED.weight_kg,height_cm=EXCLUDED.height_cm,activity=EXCLUDED.activity,
      analytics_consent=EXCLUDED.analytics_consent,survey_version=EXCLUDED.survey_version,
      province_code=EXCLUDED.province_code,updated_at=now()`,
      [uid,s.firstName,s.lastName,s.age,s.gender,s.weightKg,s.heightCm,s.activity,s.analyticsConsent,SURVEY_VERSION,
        s.province==='prefer_not_to_say'?null:s.province]);
    // Health answers exist only while their consent does: withdrawing it deletes them.
    if (s.healthConsent && s.health) {
      const h = s.health;
      await client.query(`INSERT INTO participant_health_profiles(uid,waist_cm,smoking,hypertension,diabetes,high_cholesterol,
        lipid_check,ldl_range,lipid_medication,family_history,prior_event,survey_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(uid) DO UPDATE SET
        waist_cm=EXCLUDED.waist_cm,smoking=EXCLUDED.smoking,hypertension=EXCLUDED.hypertension,diabetes=EXCLUDED.diabetes,
        high_cholesterol=EXCLUDED.high_cholesterol,lipid_check=EXCLUDED.lipid_check,ldl_range=EXCLUDED.ldl_range,
        lipid_medication=EXCLUDED.lipid_medication,family_history=EXCLUDED.family_history,prior_event=EXCLUDED.prior_event,
        survey_version=EXCLUDED.survey_version,updated_at=now()`,
        [uid,h.waistCm,h.smoking,h.hypertension,h.diabetes,h.highCholesterol,h.lipidCheck,h.ldlRange,h.lipidMedication,h.familyHistory,h.priorEvent,SURVEY_VERSION]);
    } else {
      await client.query('DELETE FROM participant_health_profiles WHERE uid=$1', [uid]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function getDemographics(scope: { sessionId?: string; quizId?: string; province?: string } = {}) {
  // DISTINCT profiles avoid counting the same person repeatedly across quiz attempts.
  const values = scope.sessionId ? [scope.sessionId] : scope.quizId ? [scope.quizId] : scope.province ? [scope.province] : [];
  const filter = scope.sessionId ? 'le.session_id::text=$1' : scope.quizId ? 'sessions.session_id::text=$1' : '';
  const people = filter ? `SELECT DISTINCT p.uid FROM profiles p JOIN leaderboard_entries le ON le.user_id=p.uid
    JOIN sessions ON sessions.id::text=le.session_id::text WHERE ${filter}`
    : scope.province ? 'SELECT uid FROM participant_surveys WHERE province_code=$1' : 'SELECT uid FROM profiles';
  const result = await pool.query(`WITH people AS (${people}) SELECT s.uid,
    s.age,s.gender,s.weight_kg::float8 AS "weightKg",
    s.height_cm::float8 AS "heightCm",s.activity,s.analytics_consent AS "analyticsConsent"
    FROM people p LEFT JOIN participant_surveys s ON s.uid=p.uid AND s.survey_version=$${values.length+1}`, [...values,SURVEY_VERSION]);
  const surveys = result.rows.flatMap(row => { const parsed=DemographicsSchema.safeParse({age:row.age,gender:row.gender,weightKg:row.weightKg,heightCm:row.heightCm,activity:row.activity,analyticsConsent:row.analyticsConsent}); return parsed.success ? [parsed.data] : []; });
  return summarizeSurveys(result.rows.length, surveys);
}
