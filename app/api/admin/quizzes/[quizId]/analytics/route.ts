import { NextRequest, NextResponse } from 'next/server';
import { getSessionAnalytics, getQuizById } from '@/lib/db/queries';
import pool from '@/lib/db/postgres';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import type { SessionComparisonItem } from '@/components/admin/QuizSessionsCompareView';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RawSessionRow {
  id: string;
  session_id: string;
  name: string | null;
  description: string | null;
  user_id: string;
  current_question_id: string | null;
  current_score: number;
  current_streak: number;
  started_at: string;
  finished_at: string | null;
  is_private: boolean;
  pin_code: string | null;
  share_token: string | null;
  status: string;
  slug?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  // 1. Authenticate and authorize admin from server-verified cookie
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 2. Rate limit
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${user.uid}`,
    '/api/admin',
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  const { quizId } = await params;

  if (!quizId || !UUID_RE.test(quizId)) {
    return NextResponse.json({ error: 'Invalid quiz ID' }, { status: 400 });
  }

  try {
    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: 'Quiz template not found' }, { status: 404 });
    }

    // Fetch all sessions belonging to this quiz template
    const allSessionsResult = await pool.query<RawSessionRow>(
      'SELECT * FROM sessions WHERE session_id = $1 ORDER BY started_at ASC',
      [quiz.id]
    );
    const sessionRows = allSessionsResult.rows || [];

    // Fetch analytics for each session in parallel
    const sessionAnalyticsPromises = sessionRows.map(async (sRow): Promise<SessionComparisonItem | null> => {
      try {
        const analytics = await getSessionAnalytics(sRow.id);
        if (!analytics) return null;

        const leaderboard = analytics.leaderboard || [];
        const participantCount = leaderboard.length;
        const totalScoreSum = leaderboard.reduce((acc, cur) => acc + (Number(cur.total_score) || 0), 0);
        const avgScore = participantCount > 0 ? Math.round(totalScoreSum / participantCount) : 0;

        const avgAccuracy = participantCount > 0
          ? Number(
              (
                leaderboard.reduce(
                  (acc, cur) =>
                    acc +
                    (Number(cur.accuracy) ||
                      (cur.total_score > 0 ? Math.min(100, Math.round(cur.total_score / 10)) : 0)),
                  0,
                ) / participantCount
              ).toFixed(1),
            )
          : 0;

        const avgTimeSeconds = participantCount > 0
          ? Math.round(
              leaderboard.reduce((acc, cur) => acc + (Number(cur.total_time_ms || 0) / 1000), 0) /
                participantCount,
            )
          : 0;

        return {
          session: {
            id: analytics.session.id,
            session_id: analytics.session.session_id,
            user_id: analytics.session.user_id,
            name: analytics.session.name,
            current_question_id: analytics.session.current_question_id,
            current_score: analytics.session.current_score,
            current_streak: analytics.session.current_streak,
            is_private: analytics.session.is_private,
            pin_code: analytics.session.pin_code,
            share_token: analytics.session.share_token,
            status: analytics.session.status,
            started_at: analytics.session.started_at,
            finished_at: analytics.session.finished_at,
            quiz_name: analytics.session.quiz_name,
            quiz_description: analytics.session.quiz_description,
          },
          macroMetrics: {
            participantCount,
            avgScore,
            avgAccuracy,
            avgTimeSeconds,
          },
          questions: (analytics.questions || []).map((q) => ({
            id: q.id,
            question_text: q.question_text,
            node_type: q.node_type,
            total_responses: q.total_responses,
            total_utility_score: q.total_utility_score,
            avg_time_ms: q.avg_time_ms,
            node_friction_score: q.node_friction_score,
            choices: (q.choices || []).map((c: Record<string, unknown>) => ({
              label: c.label as string,
              text: c.text as string,
              score_impact: c.score_impact as number,
              count: c.count as number,
              clinical_tags: (c.clinical_tags as string[]) || [],
              behavior_meaning: c.behavior_meaning as string | undefined,
            })),
          })),
        };
      } catch (err) {
        console.error(`Error processing session ${sRow.id} for quiz ${quizId}:`, err);
        return null;
      }
    });

    const comparedSessionsResults = await Promise.all(sessionAnalyticsPromises);
    const validComparedSessions = comparedSessionsResults.filter((s): s is SessionComparisonItem => s !== null);

    // Compute Overall Macro Aggregates across all valid sessions
    const totalSessions = validComparedSessions.length;
    const totalParticipants = validComparedSessions.reduce(
      (sum, s) => sum + s.macroMetrics.participantCount,
      0,
    );

    const avgScore = totalParticipants > 0
      ? Math.round(
          validComparedSessions.reduce(
            (sum, s) => sum + s.macroMetrics.avgScore * s.macroMetrics.participantCount,
            0,
          ) / totalParticipants,
        )
      : totalSessions > 0
      ? Math.round(validComparedSessions.reduce((sum, s) => sum + s.macroMetrics.avgScore, 0) / totalSessions)
      : 0;

    const avgAccuracy = totalParticipants > 0
      ? Number(
          (
            validComparedSessions.reduce(
              (sum, s) => sum + s.macroMetrics.avgAccuracy * s.macroMetrics.participantCount,
              0,
            ) / totalParticipants
          ).toFixed(1),
        )
      : totalSessions > 0
      ? Number(
          (
            validComparedSessions.reduce((sum, s) => sum + s.macroMetrics.avgAccuracy, 0) /
            totalSessions
          ).toFixed(1),
        )
      : 0;

    const avgTimeSeconds = totalParticipants > 0
      ? Math.round(
          validComparedSessions.reduce(
            (sum, s) => sum + s.macroMetrics.avgTimeSeconds * s.macroMetrics.participantCount,
            0,
          ) / totalParticipants,
        )
      : totalSessions > 0
      ? Math.round(
          validComparedSessions.reduce((sum, s) => sum + s.macroMetrics.avgTimeSeconds, 0) /
            totalSessions,
        )
      : 0;

    const accuracies = validComparedSessions.map((s) => s.macroMetrics.avgAccuracy);
    const maxAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : 0;
    const minAccuracy = accuracies.length > 0 ? Math.min(...accuracies) : 0;
    const accuracySpread = Number((maxAccuracy - minAccuracy).toFixed(1));

    // Aggregate Questions across all sessions to get consolidated error rates and distractor traps
    const questionMap = new Map<
      string,
      {
        id: string;
        question_text: string;
        node_type: string;
        totalResponses: number;
        totalUtilityScore: number;
        choicesMap: Map<string, { label: string; text: string; score_impact: number; count: number; clinical_tags: string[]; behavior_meaning?: string }>;
      }
    >();

    validComparedSessions.forEach((cohort) => {
      cohort.questions.forEach((q) => {
        if (!questionMap.has(q.id)) {
          const choicesMap = new Map<
            string,
            { label: string; text: string; score_impact: number; count: number; clinical_tags: string[]; behavior_meaning?: string }
          >();
          q.choices.forEach((c) => {
            choicesMap.set(c.label, {
              label: c.label,
              text: c.text,
              score_impact: c.score_impact,
              count: c.count,
              clinical_tags: c.clinical_tags || [],
              behavior_meaning: c.behavior_meaning,
            });
          });

          questionMap.set(q.id, {
            id: q.id,
            question_text: q.question_text,
            node_type: q.node_type,
            totalResponses: q.total_responses,
            totalUtilityScore: Number(q.total_utility_score) || 0,
            choicesMap,
          });
        } else {
          const existing = questionMap.get(q.id)!;
          existing.totalResponses += q.total_responses;
          existing.totalUtilityScore += Number(q.total_utility_score) || 0;

          q.choices.forEach((c) => {
            if (existing.choicesMap.has(c.label)) {
              existing.choicesMap.get(c.label)!.count += c.count;
            } else {
              existing.choicesMap.set(c.label, {
                label: c.label,
                text: c.text,
                score_impact: c.score_impact,
                count: c.count,
                clinical_tags: c.clinical_tags || [],
                behavior_meaning: c.behavior_meaning,
              });
            }
          });
        }
      });
    });

    const consolidatedQuestions = Array.from(questionMap.values()).map((q) => {
      const errorRate = q.totalResponses > 0
        ? Math.round(100 - (q.choicesMap.size > 0
          ? Array.from(q.choicesMap.values()).filter((choice) => choice.score_impact > 0).reduce((sum, choice) => sum + choice.count, 0) / q.totalResponses
          : 0) * 100)
        : 0;

      const choicesList = Array.from(q.choicesMap.values()).map((c) => ({
        ...c,
        percentage: q.totalResponses > 0 ? Math.round((c.count / q.totalResponses) * 100) : 0,
      }));

      const distractors = choicesList
        .filter((c) => c.score_impact <= 0)
        .sort((a, b) => b.count - a.count);

      return {
        id: q.id,
        question_text: q.question_text,
        node_type: q.node_type,
        totalResponses: q.totalResponses,
        totalUtilityScore: q.totalUtilityScore,
        errorRate,
        choices: choicesList,
        distractors,
      };
    });

    // Treat a topic as attached to a question when any answer choice carries
    // that topic tag. Score every response to that question so incorrect
    // choices without the tag still count in the topic's denominator.
    const tagScores: Record<string, { tag: string; totalResponses: number; totalUtilityScore: number; maxPossibleScore: number }> = {};

    consolidatedQuestions.forEach((q) => {
      const questionTags = new Set(q.choices.flatMap((choice) => choice.clinical_tags || []));
      if (questionTags.size === 0) return;

      const maxScore = Math.max(0, ...q.choices.map((choice) => choice.score_impact));

      questionTags.forEach((tag) => {
        if (!tagScores[tag]) {
          tagScores[tag] = { tag, totalResponses: 0, totalUtilityScore: 0, maxPossibleScore: 0 };
        }
        tagScores[tag].totalResponses += q.totalResponses;
        tagScores[tag].totalUtilityScore += q.totalUtilityScore;
        tagScores[tag].maxPossibleScore += q.totalResponses * maxScore;
      });
    });

    const domainMastery = Object.values(tagScores).map((ts) => {
      const percentage = ts.maxPossibleScore > 0
        ? Math.min(100, Math.max(0, Math.round((ts.totalUtilityScore / ts.maxPossibleScore) * 100)))
        : 0;
      return {
        tag: ts.tag,
        percentage,
        sampleSize: ts.totalResponses,
        earnedUtility: ts.totalUtilityScore,
        maxPossibleUtility: ts.maxPossibleScore,
      };
    });

    return NextResponse.json({
      quiz,
      overall: {
        totalSessions,
        totalParticipants,
        avgScore,
        avgAccuracy,
        avgTimeSeconds,
        maxAccuracy,
        minAccuracy,
        accuracySpread,
      },
      sessions: validComparedSessions.map((c) => ({
        id: c.session.id,
        name: c.session.name || `Session #${c.session.id.slice(0, 8)}`,
        pin_code: c.session.pin_code,
        status: c.session.status,
        started_at: c.session.started_at,
        ended_at: c.session.finished_at,
        participantCount: c.macroMetrics.participantCount,
        avgScore: c.macroMetrics.avgScore,
        avgAccuracy: c.macroMetrics.avgAccuracy,
        avgTimeSeconds: c.macroMetrics.avgTimeSeconds,
      })),
      questions: consolidatedQuestions,
      domainMastery,
    });
  } catch (error) {
    console.error('Failed to generate quiz overall analytics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
