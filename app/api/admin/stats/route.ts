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
        le.user_display_name,
        qs.name AS session_name,
        le.total_score,
        le.correct_count,
        le.completed_at
      FROM leaderboard_entries le
      JOIN quizzes qs ON qs.id = le.session_id
      ORDER BY le.completed_at DESC NULLS LAST
      LIMIT 10
    `),
  ]);

  if (usersResult.status === 'rejected') {
    console.error('Failed to load admin user stats:', usersResult.reason);
  }
  if (coreStats.status === 'rejected') {
    console.error('Failed to load core admin stats:', coreStats.reason);
  }
  if (monthlyResult.status === 'rejected') {
    console.error('Failed to load admin monthly activity:', monthlyResult.reason);
  }
  if (scoreDistResult.status === 'rejected') {
    console.error('Failed to load admin score distribution:', scoreDistResult.reason);
  }
  if (recentResult.status === 'rejected') {
    console.error('Failed to load admin recent activity:', recentResult.reason);
  }

  const stats =
    coreStats.status === 'fulfilled'
      ? coreStats.value.rows[0]
      : {
          active_sessions: 0,
          questions_created: 0,
          avg_score: 0,
        };

  const monthlyData: number[] = new Array(12).fill(0);
  const monthlyRows = monthlyResult.status === 'fulfilled' ? monthlyResult.value.rows : [];
  for (const row of monthlyRows) {
    monthlyData[row.month - 1] = row.count;
  }

  const dist =
    scoreDistResult.status === 'fulfilled'
      ? scoreDistResult.value.rows[0]
      : {
          correct: 0,
          incorrect: 0,
        };
  const totalAnswers = dist.correct + dist.incorrect;

  return NextResponse.json({
    totalUsers: usersResult.status === 'fulfilled' ? usersResult.value.users.length : 0,
    activeSessions: stats.active_sessions,
    questionsCreated: stats.questions_created,
    avgScore: stats.avg_score,
    monthlyActivity: monthlyData,
    scoreDistribution: {
      correct: totalAnswers > 0 ? Math.round((dist.correct / totalAnswers) * 100) : 0,
      incorrect: totalAnswers > 0 ? Math.round((dist.incorrect / totalAnswers) * 100) : 0,
    },
    recentActivity: recentResult.status === 'fulfilled' ? recentResult.value.rows : [],
  });
}
