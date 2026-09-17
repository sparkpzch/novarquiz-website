// Pure aggregation for the /stats "Health" tab. The DB query returns raw
// per-quiz answer counts; everything shown to the player is derived here so it
// can be unit-tested without Postgres.
//
// A "topic" is one quiz. An answer counts as understood when its
// utility_score is positive — the same rule completeSession() uses for
// correct_count.

import {
  accumulateVectors,
  classifyArchetype,
  normalizeProfileVectors,
  type IntendedAudience,
} from '../analytics/hcp';

export type HealthTopicRow = {
  quiz_id: string;
  quiz_name: string;
  answered: number;
  positive: number;
  /** The quiz's intended_audience — decides which wording a summary uses. */
  audience: IntendedAudience;
  /** When this quiz was last answered, ISO. Picks the topic a summary is about. */
  last_answered_at: string;
};

export type HealthStatsInput = {
  topics: HealthTopicRow[];
  /** Distinct local (Asia/Bangkok) days with at least one answer, YYYY-MM-DD. */
  answerDays: string[];
  /** Today's local date, YYYY-MM-DD. */
  today: string;
  completedQuizzes: number;
  publishedQuizzes: number;
  /**
   * Raw profile vectors, one per completed quiz. Only quizzes the player gave
   * profiling consent for reach this array — completeSession() leaves the
   * vector empty and archetype_id NULL otherwise.
   */
  profileVectors: Array<Partial<Record<string, number>>>;
  /**
   * Clinical tags on non-positive answers, one row per (quiz, tag), already
   * ordered most-missed first within each quiz. Kept per-quiz so the tags a
   * summary resolves on come from the quiz it is about.
   */
  gapTagRows: Array<{ quiz_id: string; tag: string }>;
};

export type KnowledgeLevel = 'excellent' | 'good' | 'fair' | 'needs_work';

export type HealthTopic = {
  quiz_id: string;
  name: string;
  answered: number;
  score: number;
  audience: IntendedAudience;
  lastAnsweredAt: string;
};

export type HealthStats = {
  /** Mean of per-topic scores, 0–100. Each topic weighs the same. */
  knowledgeScore: number;
  level: KnowledgeLevel;
  /** Share of published quizzes the player has completed, 0–100. */
  progress: number;
  completedQuizzes: number;
  publishedQuizzes: number;
  /** Answer-level accuracy across every topic, 0–100. Shown on the Game tab. */
  accuracy: number;
  /** Topics scored at or above SOLID_TOPIC_THRESHOLD — the plain-language counterpart to accuracy. */
  solidTopics: number;
  answered: number;
  dayStreak: number;
  /** Sorted by score, highest first. */
  topics: HealthTopic[];
  weakestTopic: HealthTopic | null;
  /**
   * The quiz answered most recently. The insight summary is about this one, not
   * the weakest: after finishing a new quiz a player expects to read about what
   * they just did, and anchoring on the weakest made the summary jump to an
   * older quiz — or vanish, when that quiz had no approved wording.
   */
  latestTopic: HealthTopic | null;
  /** Behavioural segment across every profiled quiz, or null without consent. */
  archetype: string | null;
  /** What the player most often got wrong, most-missed first. */
  gapTags: string[];
};

export const WEAK_TOPIC_THRESHOLD = 50;
/** Matches the 'excellent' band in knowledgeLevel() so the two never disagree. */
export const SOLID_TOPIC_THRESHOLD = 80;

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
      audience: t.audience,
      lastAnsweredAt: t.last_answered_at,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const answered = topics.reduce((sum, t) => sum + t.answered, 0);
  const positive = input.topics.reduce((sum, t) => sum + (t.answered > 0 ? t.positive : 0), 0);
  const knowledgeScore = topics.length
    ? Math.round(topics.reduce((sum, t) => sum + t.score, 0) / topics.length)
    : 0;

  // An opted-out player has no vectors at all; classifying an all-zero vector
  // would label them "balanced" on the strength of no evidence.
  const profileVectors = input.profileVectors.filter((vector) =>
    Object.values(vector).some((value) => typeof value === 'number' && value !== 0),
  );

  const latestTopic =
    topics.reduce<HealthTopic | null>(
      (latest, t) => (!latest || t.lastAnsweredAt > latest.lastAnsweredAt ? t : latest),
      null,
    ) ?? null;

  // Only the tags from the quiz the summary is about; mixing quizzes would
  // resolve wording against a topic the player did not just play.
  const gapTags = latestTopic
    ? input.gapTagRows.filter((r) => r.quiz_id === latestTopic.quiz_id).map((r) => r.tag)
    : [];

  return {
    knowledgeScore,
    level: knowledgeLevel(knowledgeScore),
    progress: Math.min(100, pct(input.completedQuizzes, input.publishedQuizzes)),
    completedQuizzes: input.completedQuizzes,
    publishedQuizzes: input.publishedQuizzes,
    accuracy: pct(positive, answered),
    solidTopics: topics.filter((t) => t.score >= SOLID_TOPIC_THRESHOLD).length,
    answered,
    dayStreak: dayStreak(input.answerDays, input.today),
    topics,
    weakestTopic: topics.at(-1) ?? null,
    latestTopic,
    archetype: profileVectors.length
      ? classifyArchetype(normalizeProfileVectors(accumulateVectors(profileVectors)))
      : null,
    gapTags,
  };
}
