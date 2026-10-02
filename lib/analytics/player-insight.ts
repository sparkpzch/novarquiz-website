import type { HistoryAnswer, PersonalInsightState } from './history';
import type { InsightLocale, InsightSummary } from './insights';
import type { AnswerReviewContext } from '../db/provisional-insights';

export type PlayerInsightReport = {
  state: PersonalInsightState;
  locale: InsightLocale;
  summary: InsightSummary | null;
  answers: HistoryAnswer[];
  sourceContext: AnswerReviewContext | null;
};
