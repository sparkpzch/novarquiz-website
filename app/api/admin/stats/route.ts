import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { adminAuth } from '@/lib/firebase/admin';
import { queryWithRetry } from '@/lib/db/postgres';

function getSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!);
}

async function verifyAdmin(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return false;
  try {
    const { payload } = await jwtVerify(session, getSecret());
    return !!payload.isAdmin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const [
    usersResult,
    coreStats,
    monthlyResult,
    scoreDistResult,
    playStatsResult,
    topQuizzesResult,
    topPlayersResult,
    scoreHistogramResult,
    recentResult,
  ] = await Promise.allSettled([
    adminAuth.listUsers(1000),
    queryWithRetry(`
      SELECT
        (SELECT COUNT(*) FROM quizzes WHERE is_published = TRUE)::int AS active_sessions,
        (SELECT COUNT(*) FROM questions)::int AS questions_created,
        (SELECT COALESCE(ROUND(AVG(total_score)), 0) FROM leaderboard_entries)::int AS avg_score
    `),
    queryWithRetry(`
      SELECT
        EXTRACT(MONTH FROM started_at)::int AS month,
        COUNT(*)::int AS count
      FROM sessions
      WHERE started_at >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month
    `),
    queryWithRetry(`
      SELECT
        COUNT(*) FILTER (WHERE utility_score > 0)::int AS correct,
        COUNT(*) FILTER (WHERE utility_score <= 0)::int AS incorrect
      FROM user_answers
    `),
    queryWithRetry(`
      SELECT
        (SELECT COUNT(*) FROM sessions)::int AS total_started,
        (SELECT COUNT(*) FROM leaderboard_entries WHERE completed_at IS NOT NULL)::int AS total_finished,
        (SELECT COALESCE(ROUND(AVG(total_time_ms)), 0) FROM leaderboard_entries WHERE completed_at IS NOT NULL AND total_time_ms > 0)::bigint AS avg_time_ms
    `),
    queryWithRetry(`
      SELECT
        qs.id,
        qs.name,
        COUNT(le.user_id)::int AS play_count,
        COALESCE(ROUND(AVG(le.total_score)), 0)::int AS avg_score,
        CASE
          WHEN COUNT(s.id) > 0
          THEN LEAST(ROUND(COUNT(le.user_id)::numeric / COUNT(s.id)::numeric * 100), 100)::int
          ELSE 0
        END AS completion_rate
      FROM quizzes qs
      LEFT JOIN leaderboard_entries le ON le.session_id = qs.id AND le.completed_at IS NOT NULL
      LEFT JOIN sessions s ON s.session_id = qs.id
      GROUP BY qs.id, qs.name
      ORDER BY play_count DESC, qs.name ASC
      LIMIT 6
    `),
    queryWithRetry(`
      SELECT
        user_display_name,
        COUNT(*)::int AS total_sessions,
        MAX(total_score)::int AS best_score,
        ROUND(AVG(total_score))::int AS avg_score
      FROM leaderboard_entries
      WHERE completed_at IS NOT NULL
      GROUP BY user_display_name
      ORDER BY best_score DESC
      LIMIT 8
    `),
    queryWithRetry(`
      SELECT
        CASE
          WHEN total_score < 0 THEN 0
          WHEN total_score BETWEEN 0 AND 25 THEN 1
          WHEN total_score BETWEEN 26 AND 50 THEN 2
          WHEN total_score BETWEEN 51 AND 75 THEN 3
          WHEN total_score BETWEEN 76 AND 100 THEN 4
          ELSE 5
        END AS bucket,
        COUNT(*)::int AS count
      FROM leaderboard_entries
      WHERE completed_at IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `),
    queryWithRetry(`
      SELECT
        le.user_display_name,
        qs.name AS session_name,
        le.total_score,
        le.correct_count,
        le.incorrect_count,
        le.streak,
        le.total_time_ms,
        le.completed_at
      FROM leaderboard_entries le
      JOIN quizzes qs ON qs.id = le.session_id
      ORDER BY le.completed_at DESC NULLS LAST
      LIMIT 25
    `),
  ]);

  if (usersResult.status === 'rejected') console.error('Failed to load admin user stats:', usersResult.reason);
  if (coreStats.status === 'rejected') console.error('Failed to load core admin stats:', coreStats.reason);
  if (monthlyResult.status === 'rejected') console.error('Failed to load admin monthly activity:', monthlyResult.reason);
  if (scoreDistResult.status === 'rejected') console.error('Failed to load admin score distribution:', scoreDistResult.reason);
  if (playStatsResult.status === 'rejected') console.error('Failed to load play stats:', playStatsResult.reason);
  if (topQuizzesResult.status === 'rejected') console.error('Failed to load top quizzes:', topQuizzesResult.reason);
  if (topPlayersResult.status === 'rejected') console.error('Failed to load top players:', topPlayersResult.reason);
  if (scoreHistogramResult.status === 'rejected') console.error('Failed to load score histogram:', scoreHistogramResult.reason);
  if (recentResult.status === 'rejected') console.error('Failed to load admin recent activity:', recentResult.reason);

  const stats =
    coreStats.status === 'fulfilled'
      ? coreStats.value.rows[0]
      : { active_sessions: 0, questions_created: 0, avg_score: 0 };

  const monthlyData: number[] = new Array(12).fill(0);
  const monthlyRows = monthlyResult.status === 'fulfilled' ? monthlyResult.value.rows : [];
  for (const row of monthlyRows) {
    monthlyData[row.month - 1] = row.count;
  }

  const dist =
    scoreDistResult.status === 'fulfilled'
      ? scoreDistResult.value.rows[0]
      : { correct: 0, incorrect: 0 };
  const totalAnswers = dist.correct + dist.incorrect;

  const playStats =
    playStatsResult.status === 'fulfilled'
      ? playStatsResult.value.rows[0]
      : { total_started: 0, total_finished: 0, avg_time_ms: 0 };
  const completionRate =
    playStats.total_started > 0
      ? Math.round((playStats.total_finished / playStats.total_started) * 100)
      : 0;

  const scoreHistogram = new Array(6).fill(0);
  if (scoreHistogramResult.status === 'fulfilled') {
    for (const row of scoreHistogramResult.value.rows) {
      if (row.bucket >= 0 && row.bucket < 6) {
        scoreHistogram[row.bucket] = row.count;
      }
    }
  }

  return NextResponse.json({
    totalUsers: usersResult.status === 'fulfilled' ? usersResult.value.users.length : 0,
    activeSessions: stats.active_sessions,
    questionsCreated: stats.questions_created,
    avgScore: stats.avg_score,
    totalPlaySessions: playStats.total_finished,
    completionRate,
    avgTimeMs: Number(playStats.avg_time_ms ?? 0),
    monthlyActivity: monthlyData,
    scoreDistribution: {
      correct: totalAnswers > 0 ? Math.round((dist.correct / totalAnswers) * 100) : 0,
      incorrect: totalAnswers > 0 ? Math.round((dist.incorrect / totalAnswers) * 100) : 0,
    },
    scoreHistogram,
    topQuizzes: topQuizzesResult.status === 'fulfilled' ? topQuizzesResult.value.rows : [],
    topPlayers: topPlayersResult.status === 'fulfilled' ? topPlayersResult.value.rows : [],
    recentActivity: recentResult.status === 'fulfilled' ? recentResult.value.rows : [],
  });
}
