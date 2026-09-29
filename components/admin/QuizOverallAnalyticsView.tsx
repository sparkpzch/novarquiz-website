'use client';

import type { Quiz, Session } from '@/lib/types';
import MedicalAnalyticsDashboard from './MedicalAnalyticsDashboard';
import type { CompareSessionsModalProps } from './CompareSessionsModal';

export interface QuizOverallAnalyticsData {
  quiz: Quiz;
  overall: {
    totalSessions: number;
    totalParticipants: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeSeconds: number;
    maxAccuracy: number;
    minAccuracy: number;
    accuracySpread: number;
  };
  sessions: Array<{
    id: string;
    name: string;
    pin_code: string | null;
    status: string;
    started_at: string;
    ended_at: string | null;
    participantCount: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeSeconds: number;
  }>;
  sessionBreakdowns?: Record<string, {
    topics: Array<{ tag: string; percentage: number; sampleSize: number; earnedUtility: number; maxPossibleUtility: number }>;
    questions: Array<{
      id: string;
      question_text: string;
      node_type: string;
      totalResponses: number;
      totalUtilityScore: number;
      errorRate: number;
      choices: Array<{ label: string; text: string; score_impact: number; count: number; percentage: number; clinical_tags?: string[] }>;
    }>;
  }>;
  domainMastery?: Array<{ tag: string; percentage: number; sampleSize: number; earnedUtility?: number; maxPossibleUtility?: number }>;
  questions: Array<{
    id: string;
    question_text: string;
    node_type: string;
    totalResponses: number;
    totalUtilityScore: number;
    errorRate: number;
    choices: Array<{ label: string; text: string; score_impact: number; count: number; percentage: number; clinical_tags?: string[] }>;
    distractors: Array<{ label: string; text: string; score_impact: number; count: number; percentage: number }>;
  }>;
}

export interface QuizOverallAnalyticsViewProps {
  data: QuizOverallAnalyticsData;
  allQuizzes?: Quiz[];
  allSessions?: CompareSessionsModalProps['allSessions'];
  onBack?: () => void;
}

export default function QuizOverallAnalyticsView({
  data,
  allQuizzes = [],
  allSessions = [],
  onBack,
}: QuizOverallAnalyticsViewProps) {
  const aggregateSession = {
    id: data.quiz.id,
    session_id: data.quiz.id,
    name: data.quiz.name,
    description: data.quiz.description ?? '',
    user_id: '',
    current_question_id: null,
    current_score: data.overall.avgScore,
    current_streak: 0,
    started_at: data.quiz.created_at,
    finished_at: null,
    is_private: false,
    pin_code: null,
    share_token: null,
    status: 'completed',
    quiz_name: data.quiz.name,
    quiz_description: data.quiz.description ?? '',
  } as Session & { quiz_name: string; quiz_description: string };

  return (
    <MedicalAnalyticsDashboard
      aggregateOnly
      aggregateMetrics={data.overall}
      aggregateTopics={data.domainMastery ?? []}
      aggregateSessions={data.sessions}
      aggregateSessionBreakdowns={data.sessionBreakdowns}
      session={aggregateSession}
      leaderboard={[]}
      questions={data.questions.map((question) => ({
        id: question.id,
        question_text: question.question_text,
        node_type: question.node_type,
        total_responses: question.totalResponses,
        total_utility_score: question.totalUtilityScore,
        avg_time_ms: 0,
        error_rate_percent: question.errorRate,
        choices: question.choices.map((choice) => ({
          label: choice.label,
          text: choice.text,
          score_impact: choice.score_impact,
          count: choice.count,
          clinical_tags: choice.clinical_tags ?? [],
        })),
      }))}
      allQuizzes={allQuizzes}
      allSessions={allSessions}
      onBack={onBack}
    />
  );
}
