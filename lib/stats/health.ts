// Pure aggregation for the /stats "Health" tab. The DB query returns raw
// per-quiz answer counts; everything shown to the player is derived here so it
// can be unit-tested without Postgres.
//
// A "topic" is one quiz. An answer counts as understood when its
// utility_score is positive — the same rule completeSession() uses for
// correct_count.

export type HealthTopicRow = {
  quiz_id: string;
  quiz_name: string;
  answered: number;
  positive: number;
};

export type HealthStatsInput = {
  topics: HealthTopicRow[];
  /** Distinct local (Asia/Bangkok) days with at least one answer, YYYY-MM-DD. */
  answerDays: string[];
  /** Today's local date, YYYY-MM-DD. */
  today: string;
  completedQuizzes: number;
  publishedQuizzes: number;
};

export type KnowledgeLevel = 'excellent' | 'good' | 'fair' | 'needs_work';

export type HealthTopic = {
  quiz_id: string;
  name: string;
  answered: number;
  score: number;
};

export type HealthStats = {
  /** Mean of per-topic scores, 0–100. Each topic weighs the same. */
  knowledgeScore: number;
  level: KnowledgeLevel;
  /** Share of published quizzes the player has completed, 0–100. */
  progress: number;
  completedQuizzes: number;
  publishedQuizzes: number;
  /** Answer-level accuracy across every topic, 0–100. */
  accuracy: number;
  answered: number;
  dayStreak: number;
  /** Sorted by score, highest first. */
  topics: HealthTopic[];
  weakestTopic: HealthTopic | null;
};

export const WEAK_TOPIC_THRESHOLD = 50;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function knowledgeLevel(score: number): KnowledgeLevel {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'needs_work';
}

function previousDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Consecutive days with answers, ending today — or yesterday, so the streak
// doesn't read 0 before the player has played today.
export function dayStreak(answerDays: string[], today: string) {
  const days = new Set(answerDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export function summarizeHealthStats(input: HealthStatsInput): HealthStats {
  const topics = input.topics
    .filter((t) => t.answered > 0)
    .map((t) => ({
      quiz_id: t.quiz_id,
      name: t.quiz_name,
      answered: t.answered,
      score: pct(t.positive, t.answered),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const answered = topics.reduce((sum, t) => sum + t.answered, 0);
  const positive = input.topics.reduce((sum, t) => sum + (t.answered > 0 ? t.positive : 0), 0);
  const knowledgeScore = topics.length
    ? Math.round(topics.reduce((sum, t) => sum + t.score, 0) / topics.length)
    : 0;

  return {
    knowledgeScore,
    level: knowledgeLevel(knowledgeScore),
    progress: Math.min(100, pct(input.completedQuizzes, input.publishedQuizzes)),
    completedQuizzes: input.completedQuizzes,
    publishedQuizzes: input.publishedQuizzes,
    accuracy: pct(positive, answered),
    answered,
    dayStreak: dayStreak(input.answerDays, input.today),
    topics,
    weakestTopic: topics.at(-1) ?? null,
  };
}
