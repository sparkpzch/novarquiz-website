import type { AnswerReviewItem } from '../db/provisional-insights';
import type { TopicUnderstanding } from '../stats/health';
import type { PersonalFeedback } from './personal-feedback';

export type UserHistoryRow = {
  session_id: string;
  quiz_id: string | null;
  session_name: string;
  session_description: string | null;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  total_time_ms: number | null;
  completed_at: string | null;
  rank: number;
  total_players: number;
};

export type HistoryAnswer = AnswerReviewItem & {
  id: string;
  utilityScore: number;
  maxUtility: number;
  timeMs: number | null;
  tags: string[];
};

export type PersonalInsightState = 'generating' | 'pending' | 'approved' | 'rejected' | 'unavailable' | 'consent-required' | 'standard';

export type PersonalHistoryReport = {
  session: UserHistoryRow;
  answers: HistoryAnswer[];
  topics: TopicUnderstanding[];
  feedback: PersonalFeedback | null;
  insightState?: PersonalInsightState;
};

export function summarizeHistoryTopics(answers: HistoryAnswer[]): TopicUnderstanding[] {
  const topics = new Map<string, TopicUnderstanding>();
  for (const answer of answers) {
    for (const tag of new Set(answer.tags)) {
      const topic = topics.get(tag) ?? { tag, percentage: null, earnedUtility: 0, maxUtility: 0, responses: 0, questionCount: 0 };
      topic.earnedUtility += answer.utilityScore;
      topic.maxUtility += answer.maxUtility;
      topic.responses += 1;
      topic.questionCount += 1;
      topics.set(tag, topic);
    }
  }
  return [...topics.values()].map((topic) => ({
    ...topic,
    percentage: topic.maxUtility > 0 ? Math.min(100, Math.max(0, Math.round(topic.earnedUtility / topic.maxUtility * 100))) : null,
  })).sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101) || a.tag.localeCompare(b.tag));
}
