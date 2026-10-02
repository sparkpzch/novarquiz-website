'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import type { Session, LeaderboardEntry, Quiz } from '@/lib/types';
import CompareSessionsModal, { type CompareSessionsModalProps } from './CompareSessionsModal';
import { FilteredQuestionAnalysisTable } from './AnalyticsBreakdownComponents';
import TopicUnderstandingGraph from './TopicUnderstandingGraph';
import DemographicsPanel from './DemographicsPanel';
import ReportOverviewGraphs from './ReportOverviewGraphs';
import chartStyles from './report-charts.module.css';
import PlayerInsightPanel from './PlayerInsightPanel';

type CompareSessionItem = CompareSessionsModalProps['allSessions'][number];

// ==========================================
// TYPES & DATA CONTRACTS
// ==========================================

export type MedicalTag = string;

export type UnderstandingLevel = 'low' | 'moderate' | 'high';

export interface DistractorItem {
  key: string;
  text: string;
  percentage: number;
  isCorrect: boolean;
  utilityScore?: number;
  clinicalNote?: string;
}

export interface QuestionDataNode {
  id: string;
  nodeCode: string;
  nodeType: 'DECISION_NODE' | 'CLINICAL_BRANCH' | 'DIAGNOSTIC_ROOT';
  branchLabel: string;
  tag: MedicalTag;
  tags: MedicalTag[];
  understandingLevel: UnderstandingLevel;
  questionText: string;
  clinicalScenario: string;
  avgTimeSeconds: number;
  targetTimeSeconds?: number;
  errorRatePercent: number;
  understandingScore: number;
  sampleSize: number;
  correctResponses: number;
  totalUtilityScore: number;
  maxScore: number;
  primaryDistractorKey: string;
  primaryDistractorSummary: string;
  distractors: DistractorItem[];
  pedagogicalAction: string;
  userResponses: Record<string, { selectedOption: string; isCorrect: boolean; utilityScore: number; timeSeconds: number }>;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  specialty: string;
  score: number;
  accuracy: number;
  totalTimeSeconds: number;
  rank: number;
  gapTags: MedicalTag[];
  headline: string;
  photoUrl?: string;
}

export interface MatrixCellSummary {
  tag: MedicalTag;
  level: UnderstandingLevel;
  count: number;
  avgScore: number;
  totalResponses: number;
  highFrictionCount: number;
  userAnsweredCount?: number;
  userAccuracy?: number;
}

export interface MedicalAnalyticsDashboardProps {
  /** Render the shared report layout using quiz-wide aggregates only. */
  aggregateOnly?: boolean;
  aggregateMetrics?: {
    totalSessions: number;
    totalParticipants: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeSeconds: number;
    accuracySpread: number;
  };
  aggregateTopics?: Array<{ tag: string; percentage: number; sampleSize: number; earnedUtility?: number; maxPossibleUtility?: number }>;
  aggregateSessions?: Array<{
    id: string;
    name: string;
    status: string;
    started_at: string;
    participantCount: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeSeconds?: number;
  }>;
  aggregateSessionBreakdowns?: Record<string, {
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
  session?: Session & {
    quiz_name: string;
    quiz_description: string;
    intended_audience?: string;
    presentation_mode?: string;
  };
  leaderboard?: (LeaderboardEntry & { profile_photo?: string })[];
  questions?: Array<{
    id: string;
    question_text: string;
    node_type: string;
    total_responses: number;
    total_utility_score?: number;
    avg_time_ms: number;
    node_friction_score?: number;
    error_rate_percent?: number;
    topic_tag?: string;
    scenario?: string;
    clinical_scenario?: string;
    choices?: Array<{ label?: string; text?: string; choice_text?: string; count?: number; score_impact?: number; clinical_tags?: string[]; behavior_meaning?: string | null }>;
    user_responses?: Record<string, { selectedOption: string; isCorrect: boolean; utilityScore: number; timeSeconds: number }>;
  }>;
  insights?: {
    audience_mode_summary: Record<string, number>;
    highest_friction_nodes: Array<{
      question_id: string;
      question_text: string;
      node_friction_score: number;
    }>;
  };
  insightBreakdown?: Array<{
    user_id: string;
    user_display_name: string | null;
    answered: number;
    missed: number;
    gap_tags: string[];
    headline: string | null;
    suggestion: string | null;
  }>;
  peerSessions?: PeerSessionOption[];
  allQuizzes?: Quiz[];
  allSessions?: CompareSessionsModalProps['allSessions'];
  onBack?: () => void;
}

export interface PeerSessionOption {
  id: string;
  name: string;
  pin_code?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  participant_count?: number;
  avg_score?: number;
  avg_accuracy?: number;
  avg_time_seconds?: number;
  cohort_label?: string;
  tag_scores?: Record<MedicalTag, number>;
  node_error_rates?: Record<string, number>;
  node_avg_times?: Record<string, number>;
}

export const UNDERSTANDING_TIERS: {
  id: UnderstandingLevel;
  label: string;
  range: string;
  thresholdDesc: string;
  accentColor: string;
  headerBg: string;
  badgeStyle: string;
}[] = [
    {
      id: 'low',
      label: 'Below 50%',
      range: '< 50%',
      thresholdDesc: 'More than half of answers incorrect',
      accentColor: '#E11D48',
      headerBg: 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-200 text-rose-900',
      badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      id: 'moderate',
      label: '50–75%',
      range: '50% - 75%',
      thresholdDesc: 'Some answers incorrect',
      accentColor: '#D97706',
      headerBg: 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-200 text-amber-900',
      badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      id: 'high',
      label: 'Above 75%',
      range: '> 75%',
      thresholdDesc: 'Most answers correct',
      accentColor: '#0284C7',
      headerBg: 'from-sky-500/10 via-sky-500/5 to-transparent border-sky-200 text-sky-900',
      badgeStyle: 'bg-sky-50 text-sky-800 border-sky-200',
    },
  ];

// ==========================================
// CLINICAL PLAYERS DATASET
// ==========================================

export default function MedicalAnalyticsDashboard({
  aggregateOnly = false,
  aggregateMetrics,
  aggregateTopics = [],
  aggregateSessions = [],
  aggregateSessionBreakdowns,
  session,
  leaderboard,
  questions,
  insightBreakdown,
  peerSessions = [],
  allQuizzes: initialAllQuizzes,
  allSessions: initialAllSessions,
  onBack,
}: MedicalAnalyticsDashboardProps = {}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  // Multi-session Compare Modal State (Matching QuizManage)
  const [compareModal, setCompareModal] = useState<{
    isOpen: boolean;
    quizId: string | null;
    selectedSessionIds: string[];
  }>({
    isOpen: false,
    quizId: null,
    selectedSessionIds: [],
  });

  const [fetchedQuizzes, setFetchedQuizzes] = useState<Quiz[]>([]);
  const [fetchedSessions, setFetchedSessions] = useState<CompareSessionsModalProps['allSessions']>([]);

  useEffect(() => {
    if (!initialAllQuizzes?.length || !initialAllSessions?.length) {
      Promise.all([
        fetch('/api/quizzes?all=true').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/sessions').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]).then(([quizzes, sessions]) => {
        if (Array.isArray(quizzes) && quizzes.length > 0) setFetchedQuizzes(quizzes);
        if (Array.isArray(sessions) && sessions.length > 0) setFetchedSessions(sessions);
      });
    }
  }, [initialAllQuizzes, initialAllSessions]);

  const allQuizzes = initialAllQuizzes && initialAllQuizzes.length > 0 ? initialAllQuizzes : fetchedQuizzes;
  const allSessions = initialAllSessions && initialAllSessions.length > 0 ? initialAllSessions : fetchedSessions;

  // Active Filter State: Selected Player (null = Entire Cohort)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);

  // Active Filter State: Matrix Cell (null = All tags/levels)
  const [selectedTag, setSelectedTag] = useState<MedicalTag | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<UnderstandingLevel | null>(null);

  // Search & Filter controls
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [leaderboardFilterTab, setLeaderboardFilterTab] = useState<'all' | 'gaps' | 'high'>('all');
  const [questionSearch, setQuestionSearch] = useState<string>('');
  const [selectedAggregateSessionId, setSelectedAggregateSessionId] = useState<string | null>(null);
  const [aggregateSessionSearch, setAggregateSessionSearch] = useState('');
  const [aggregateSessionFilter, setAggregateSessionFilter] = useState<'all' | 'high' | 'developing' | 'review'>('all');

  // -------------------------------------------------------------
  // DYNAMIC REAL DATA CONTRACT CONVERSION
  // -------------------------------------------------------------
  const realPlayers = useMemo<PlayerProfile[]>(() => {
    if (!leaderboard || leaderboard.length === 0) return [];

    const breakdownMap = new Map<string, NonNullable<typeof insightBreakdown>[number]>();
    (insightBreakdown || []).forEach((b) => {
      if (b.user_id) breakdownMap.set(b.user_id, b);
    });

    return leaderboard.map((entry, idx) => {
      const bd = breakdownMap.get(entry.user_id);
      const totalQuestions = (entry.correct_count || 0) + (entry.incorrect_count || 0) + (entry.unanswered_count || 0);
      const accuracy = totalQuestions > 0
        ? Math.round(((entry.correct_count || 0) / totalQuestions) * 100)
        : 0;
      const totalTimeSeconds = Math.round((entry.total_time_ms || 0) / 1000);
      const gapTags = (bd?.gap_tags || []) as MedicalTag[];

      return {
        id: String(entry.user_id),
        displayName: entry.user_display_name || 'Unnamed participant',
        specialty: '',
        score: entry.total_score || 0,
        accuracy,
        totalTimeSeconds,
        rank: idx + 1,
        gapTags: gapTags.length > 0 ? gapTags : [],
        headline: bd?.headline || bd?.suggestion || '',
        photoUrl: entry.profile_photo || entry.user_photo_url || undefined,
      };
    });
  }, [leaderboard, insightBreakdown]);

  const realQuestions = useMemo<QuestionDataNode[]>(() => {
    const selectedBreakdownQuestions = selectedAggregateSessionId
      ? aggregateSessionBreakdowns?.[selectedAggregateSessionId]?.questions
      : undefined;
    const sourceQuestions: MedicalAnalyticsDashboardProps['questions'] = aggregateOnly && selectedBreakdownQuestions
      ? selectedBreakdownQuestions.map((question) => ({
          id: question.id,
          question_text: question.question_text,
          node_type: question.node_type,
          total_responses: question.totalResponses,
          total_utility_score: question.totalUtilityScore,
          error_rate_percent: question.errorRate,
          avg_time_ms: 0,
          choices: question.choices,
        }))
      : questions;
    if (!sourceQuestions || sourceQuestions.length === 0) return [];

    return sourceQuestions.map((q, idx) => {
      const totalResponses = q.total_responses ?? 0;
      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      const choiceTags = rawChoices.flatMap((choice) => Array.isArray(choice.clinical_tags) ? choice.clinical_tags : []);
      const tags = Array.from(new Set([
        ...choiceTags,
        ...(typeof q.topic_tag === 'string' ? [q.topic_tag] : []),
      ]));
      const tag = tags[0] || '';
      const correctAnswers = rawChoices
        .filter((choice) => (choice.score_impact ?? 0) > 0)
        .reduce((sum, choice) => sum + (Number(choice.count) || 0), 0);
      const maxScore = Math.max(0, ...rawChoices.map((choice) => Number(choice.score_impact) || 0));
      const hasChoiceCounts = rawChoices.some((choice) => Number.isFinite(Number(choice.count)));
      const computedErrorRate = totalResponses > 0 && hasChoiceCounts
        ? Math.round(100 - (correctAnswers / totalResponses) * 100)
        : undefined;
      const errorRatePercent = Math.round(q.error_rate_percent ?? computedErrorRate ?? 0);
      const understandingScore = totalResponses > 0 ? Math.max(0, 100 - errorRatePercent) : 0;
      const understandingLevel: UnderstandingLevel =
        errorRatePercent > 50 ? 'low' : errorRatePercent > 25 ? 'moderate' : 'high';
      const avgTimeSeconds = Math.round((q.avg_time_ms ?? 0) / 1000);
      const distractors: DistractorItem[] = rawChoices.map((c) => {
          const pct = totalResponses > 0 ? Math.round(((c.count || 0) / totalResponses) * 100) : 0;
          const isCorrect = (c.score_impact ?? 0) > 0;
          return {
            key: c.label || '',
            text: c.text || c.choice_text || '',
            percentage: pct,
            isCorrect,
            utilityScore: Number(c.score_impact) || 0,
            clinicalNote: c.behavior_meaning || (!isCorrect && pct > 20 ? 'Frequently selected incorrect answer.' : undefined),
          };
        });

      const primaryDistractor = distractors.find((d) => !d.isCorrect) || distractors[0];

      return {
        id: q.id,
        nodeCode: q.node_type ? `NODE-${q.node_type.toUpperCase()}` : `QUESTION-${idx + 1}`,
        nodeType: q.node_type === 'CLINICAL_BRANCH' || q.node_type === 'DIAGNOSTIC_ROOT'
          ? q.node_type
          : 'DECISION_NODE',
        branchLabel: `Question ${idx + 1}`,
        tag,
        tags,
        understandingLevel,
        questionText: q.question_text || '',
        clinicalScenario: q.scenario || q.clinical_scenario || '',
        avgTimeSeconds,
        targetTimeSeconds: undefined,
        errorRatePercent,
        understandingScore,
        sampleSize: totalResponses,
        correctResponses: correctAnswers,
        totalUtilityScore: Number(q.total_utility_score) || 0,
        maxScore,
        primaryDistractorKey: primaryDistractor ? `Option ${primaryDistractor.key}` : '',
        primaryDistractorSummary: primaryDistractor ? `Option ${primaryDistractor.key} selected by ${primaryDistractor.percentage}%` : '',
        distractors,
        pedagogicalAction: errorRatePercent > 40 ? 'Review this question and its answer explanation.' : '',
        userResponses: q.user_responses ?? {},
      };
    });
  }, [aggregateOnly, aggregateSessionBreakdowns, selectedAggregateSessionId, questions, leaderboard]);

  // Use only records returned for the current session or quiz.
  const effectivePlayers = useMemo(() => {
    if (aggregateOnly) return [];
    return realPlayers;
  }, [aggregateOnly, realPlayers]);

  const effectiveQuestions = useMemo(() => {
    if (aggregateOnly) return realQuestions;
    return realQuestions;
  }, [aggregateOnly, realQuestions]);

  const availableTags = useMemo(
    () => Array.from(new Set(effectiveQuestions.flatMap((question) => question.tags))),
    [effectiveQuestions],
  );

  const cohortAccuracy = useMemo(() => {
    if (effectivePlayers.length === 0) return 0;
    return Number((effectivePlayers.reduce((sum, p) => sum + p.accuracy, 0) / effectivePlayers.length).toFixed(1));
  }, [effectivePlayers]);

  const cohortVelocity = useMemo(() => {
    if (effectivePlayers.length === 0 || effectiveQuestions.length === 0) return 0;
    const avgSec = effectivePlayers.reduce((sum, p) => sum + p.totalTimeSeconds, 0) / effectivePlayers.length / Math.max(1, effectiveQuestions.length);
    return Number(avgSec.toFixed(1));
  }, [effectivePlayers, effectiveQuestions]);

  // Fallback lists guaranteeing current quiz and current session are available
  const effectiveQuizzes = useMemo(() => {
    const list = [...allQuizzes];
    if (session?.session_id && !list.some((q) => String(q.id) === String(session.session_id))) {
      list.unshift({
        id: session.session_id,
        name: session.quiz_name || 'Current Quiz',
        description: session.quiz_description || '',
      } as unknown as Quiz);
    }
    return list;
  }, [allQuizzes, session]);

  const effectiveAllSessions = useMemo(() => {
    const list: CompareSessionsModalProps['allSessions'] = [...allSessions];
    const avgScore = effectivePlayers.length > 0
      ? Math.round(effectivePlayers.reduce((sum, p) => sum + p.score, 0) / effectivePlayers.length)
      : 0;

    if (session?.id && !list.some((s) => String(s.id) === String(session.id))) {
      const fallbackItem: CompareSessionItem = {
        ...session,
        id: session.id,
        session_id: session.session_id || '',
        name: session.name || session.quiz_name || '',
        raw_session_name: session.name || null,
        quiz_name: session.quiz_name,
        status: session.status,
        started_at: session.started_at,
        play_count: effectivePlayers.length,
        avg_score: avgScore,
      };
      list.unshift(fallbackItem);
    }
    (peerSessions || []).forEach((ps) => {
      if (!list.some((s) => String(s.id) === String(ps.id))) {
        if (!ps.status || !ps.started_at || !ps.name) return;
        const peerItem: CompareSessionItem = {
          id: ps.id,
          session_id: session?.session_id || '',
          name: ps.name,
          raw_session_name: ps.name,
          quiz_name: session?.quiz_name,
          pin_code: ps.pin_code || null,
          user_id: '',
          current_question_id: null,
          current_score: ps.avg_score || 0,
          current_streak: 0,
          is_private: false,
          share_token: null,
          status: ps.status as Session['status'],
          started_at: ps.started_at,
          finished_at: ps.ended_at || null,
          play_count: ps.participant_count,
          avg_score: ps.avg_score,
        };
        list.push(peerItem);
      }
    });
    return list;
  }, [allSessions, session, effectivePlayers, peerSessions]);

  // -------------------------------------------------------------
  // SESSION BENCHMARK COMPARISON STATE
  // -------------------------------------------------------------
  const [selectedCompareSession, setSelectedCompareSession] = useState<PeerSessionOption | null>(null);
  const [activeLeaderboardCohort, setActiveLeaderboardCohort] = useState<'current' | 'compare'>('current');

  // Available peer sessions come only from stored sessions returned by the API.
  const availableCompareSessions = useMemo(() => {
    const existingIds = new Set(session?.id ? [session.id] : []);
    const list: PeerSessionOption[] = [];

    (peerSessions || []).forEach((ps) => {
      if (!existingIds.has(ps.id)) {
        existingIds.add(ps.id);
        list.push({
          ...ps,
          cohort_label: ps.name,
        });
      }
    });

    return list;
  }, [peerSessions, session?.id]);

  // Aggregate metrics comparison between Current Session and Compared Benchmark Session
  const benchmarkComparisonMetrics = useMemo(() => {
    if (!selectedCompareSession || effectivePlayers.length === 0) return null;

    const currentAccuracy = cohortAccuracy;
    const compareAccuracy = selectedCompareSession.avg_accuracy;
    if (typeof compareAccuracy !== 'number') return null;
    const accuracyDelta = Number((currentAccuracy - compareAccuracy).toFixed(1));

    const currentParticipants = effectivePlayers.length;
    const compareParticipants = selectedCompareSession.participant_count ?? 0;
    const participantDelta = currentParticipants - compareParticipants;

    const currentTime = Math.round(cohortVelocity * 7);
    const compareTime = selectedCompareSession.avg_time_seconds;
    if (typeof compareTime !== 'number') return null;
    const timeDelta = currentTime - compareTime; // negative = faster

    return {
      currentAccuracy,
      compareAccuracy,
      accuracyDelta,
      currentParticipants,
      compareParticipants,
      participantDelta,
      currentTime,
      compareTime,
      timeDelta,
    };
  }, [selectedCompareSession, effectivePlayers, cohortAccuracy, cohortVelocity]);

  // -------------------------------------------------------------
  // INTERACTIVE TOGGLE HANDLERS (CLICK AGAIN TO UNFILTER)
  // -------------------------------------------------------------

  // Player Toggle: Click selected player again to unfilter (keeps selected topic tag intact!)
  const handlePlayerToggle = (player: PlayerProfile) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(player);
    }
  };

  // Matrix Cell Toggle: Click selected matrix cell again to unfilter
  const handleCellToggle = (tag: MedicalTag, level: UnderstandingLevel) => {
    if (selectedTag === tag && selectedLevel === level) {
      setSelectedTag(null);
      setSelectedLevel(null);
    } else {
      setSelectedTag(tag);
      setSelectedLevel(level);
    }
  };

  // Tag-only Toggle: click a tag card to filter all questions under that tag
  const handleTagToggle = (tag: MedicalTag) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      setSelectedLevel(null);
    } else {
      setSelectedTag(tag);
      setSelectedLevel(null);
    }
  };

  // 1-Click Clear All Filters
  const handleClearAllFilters = () => {
    setSelectedPlayer(null);
    setSelectedTag(null);
    setSelectedLevel(null);
  };

  // -------------------------------------------------------------
  // LEADERBOARD SEARCH FILTERING
  // -------------------------------------------------------------
  const filteredPlayers = useMemo(() => {
    const baseList = selectedCompareSession && activeLeaderboardCohort === 'compare' ? [] : effectivePlayers;

    return baseList.filter((player) => {
      if (leaderboardFilterTab === 'gaps' && player.gapTags.length === 0) return false;
      if (leaderboardFilterTab === 'high' && player.accuracy < 75) return false;

      if (!playerSearchQuery.trim()) return true;
      const query = playerSearchQuery.toLowerCase();
      return (
        player.displayName.toLowerCase().includes(query) ||
        player.specialty.toLowerCase().includes(query) ||
        player.gapTags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [playerSearchQuery, leaderboardFilterTab, selectedCompareSession, activeLeaderboardCohort, effectivePlayers]);

  // -------------------------------------------------------------
  // DYNAMIC 2D HEATMAP MATRIX COMPUTATION
  // Recomputes either for Cohort (all) OR Exclusively for Selected Player
  // -------------------------------------------------------------
  const matrixSummaries = useMemo(() => {
    const summaryMap: Record<string, MatrixCellSummary> = {};

    availableTags.forEach((tag) => {
      UNDERSTANDING_TIERS.forEach((tier) => {
        const key = `${tag}__${tier.id}`;
        const tagQuestions = effectiveQuestions.filter((q) => q.tags.includes(tag) && q.sampleSize > 0);

        if (!selectedPlayer) {
          // COHORT AGGREGATE MODE:
          const matched = tagQuestions.filter((q) => q.understandingLevel === tier.id);
          const count = matched.length;
          const totalResp = matched.reduce((acc, q) => acc + q.sampleSize, 0);
          const avgScore = count > 0
            ? Math.round(matched.reduce((acc, q) => acc + q.understandingScore, 0) / count)
            : 0;
          const highFriction = matched.filter((q) => q.errorRatePercent > 50).length;

          summaryMap[key] = {
            tag,
            level: tier.id,
            count,
            avgScore,
            totalResponses: totalResp,
            highFrictionCount: highFriction,
          };
        } else {
          // INDIVIDUAL PLAYER EXCLUSIVE MODE:
          const playerResponses = tagQuestions.map((q) => {
            const resp = q.userResponses[selectedPlayer.id];
            if (!resp) return null;
            const responseScore = q.maxScore > 0
              ? Math.min(100, Math.max(0, Math.round((resp.utilityScore / q.maxScore) * 100)))
              : 0;
            const responseLevel: UnderstandingLevel = responseScore < 50 ? 'low' : responseScore < 75 ? 'moderate' : 'high';
            return { ...resp, questionId: q.id, responseScore, responseLevel };
          }).filter(Boolean) as Array<{ selectedOption: string; isCorrect: boolean; utilityScore: number; timeSeconds: number; questionId: string; responseScore: number; responseLevel: UnderstandingLevel }>;

          const userTotal = playerResponses.length;
          const userEarnedScore = playerResponses.reduce((sum, response) => sum + response.utilityScore, 0);
          const userMaxPossibleScore = tagQuestions.reduce((sum, question) => sum + (question.userResponses[selectedPlayer.id] ? question.maxScore : 0), 0);
          const userAccuracy = userMaxPossibleScore > 0
            ? Math.min(100, Math.max(0, Math.round((userEarnedScore / userMaxPossibleScore) * 100)))
            : 0;
          const matched = playerResponses.filter((response) => response.responseLevel === tier.id);
          const matchedScore = matched.length > 0
            ? Math.round(matched.reduce((sum, response) => sum + response.responseScore, 0) / matched.length)
            : 0;

          summaryMap[key] = {
            tag,
            level: tier.id,
            count: matched.length,
            avgScore: matchedScore,
            totalResponses: userTotal,
            highFrictionCount: playerResponses.filter((response) => response.responseLevel === 'low').length,
            userAnsweredCount: userTotal,
            userAccuracy,
          };
        }
      });
    });

    return summaryMap;
  }, [selectedPlayer, effectiveQuestions, effectivePlayers, availableTags]);

  // -------------------------------------------------------------
  // DYNAMIC FILTERED QUESTIONS WITH MEMOIZED PERFORMANCE CACHE
  // Dynamically re-renders questions based on Matrix Cell & Search Query
  // -------------------------------------------------------------
  const filteredQuestions = useMemo(() => {
    return effectiveQuestions.filter((q) => {
      // 1. Tag & Level Filter (if a matrix cell is selected; if null, show all!)
      if (selectedTag) {
        const normSelectedTag = selectedTag.replace(/^#/, '').toLowerCase().trim();
        if (!q.tags.some((tag) => tag.replace(/^#/, '').toLowerCase().trim() === normSelectedTag)) return false;
      }

      if (selectedLevel) {
        if (q.understandingLevel !== selectedLevel) return false;
      }

      // 2. Text Search filter
      if (!questionSearch.trim()) return true;
      const term = questionSearch.toLowerCase().trim();
      return (
        q.questionText.toLowerCase().includes(term) ||
        q.nodeCode.toLowerCase().includes(term) ||
        q.branchLabel.toLowerCase().includes(term) ||
        q.clinicalScenario.toLowerCase().includes(term)
      );
    });
  }, [selectedTag, selectedLevel, questionSearch, effectiveQuestions]);

  // Memoized player response cache for O(1) performance lookup
  const playerResponseMap = useMemo(() => {
    if (!selectedPlayer) return new Map();
    const map = new Map<string, { selectedOption: string; isCorrect: boolean; timeSeconds: number }>();

    effectiveQuestions.forEach((question) => {
      const response = question.userResponses?.[selectedPlayer.id];
      if (response) map.set(question.id, response);
    });

    return map;
  }, [selectedPlayer, effectiveQuestions]);

  const activePlayersCount = effectivePlayers.length;
  const sessionTitle = session?.name || session?.quiz_name || 'Session analytics';

  if (aggregateOnly) {
    const metrics = aggregateMetrics ?? {
      totalSessions: aggregateSessions.length,
      totalParticipants: 0,
      avgScore: 0,
      avgAccuracy: 0,
      avgTimeSeconds: 0,
      accuracySpread: 0,
    };
    const selectedAggregateSession = aggregateSessions.find((item) => item.id === selectedAggregateSessionId) ?? null;
    const displayMetrics = selectedAggregateSession ? {
      totalSessions: 1,
      totalParticipants: selectedAggregateSession.participantCount,
      avgScore: selectedAggregateSession.avgScore,
      avgAccuracy: selectedAggregateSession.avgAccuracy,
      avgTimeSeconds: selectedAggregateSession.avgTimeSeconds ?? 0,
      accuracySpread: 0,
    } : metrics;
    const displayTopics = selectedAggregateSessionId
      ? aggregateSessionBreakdowns?.[selectedAggregateSessionId]?.topics ?? aggregateTopics
      : aggregateTopics;
    const visibleAggregateSessions = aggregateSessions.filter((item) => {
      const matchesSearch = `${item.name} ${item.status}`.toLowerCase().includes(aggregateSessionSearch.trim().toLowerCase());
      const matchesFilter = aggregateSessionFilter === 'all'
        || (aggregateSessionFilter === 'high' && item.avgAccuracy >= 75)
        || (aggregateSessionFilter === 'developing' && item.avgAccuracy >= 50 && item.avgAccuracy < 75)
        || (aggregateSessionFilter === 'review' && item.avgAccuracy < 50);
      return matchesSearch && matchesFilter;
    });
    return (
      <div className="nq-full-report nq-report-canvas w-full p-3 font-sans text-[#16324F] antialiased sm:p-5 md:p-6 lg:p-8">
        <div className="mx-auto max-w-[1700px] space-y-5">
          <header className="space-y-5 rounded-3xl border border-[#0460A9]/15 bg-white p-5 shadow-[0_4px_24px_rgba(4,96,169,0.05)] sm:p-6">
            <div className="flex flex-col gap-4 border-b border-[#0460A9]/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {onBack && <button onClick={onBack} className="mt-1 rounded-xl border border-[#0460A9]/15 bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#5D7EA1] hover:bg-[#EBF3FA] hover:text-[#0460A9]">← Back</button>}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0460A9]/20 bg-[#EBF3FA] px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-[#0460A9]"><span className="h-2 w-2 rounded-full bg-[#0D8C6D]" />{selectedAggregateSession ? 'SESSION FILTER' : 'QUIZ ANALYTICS'}</span>
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">All session results</span>
                  </div>
                  <h1 className="mt-2 text-xl font-bold tracking-tight text-[#16324F] sm:text-2xl">{sessionTitle}</h1>
                  <p className="mt-0.5 text-xs text-[#5D7EA1] sm:text-sm">{selectedAggregateSession ? `Filtered to ${selectedAggregateSession.name}. Individual participant details are not shown.` : `Quiz results across ${metrics.totalSessions} sessions. Individual participant details are not shown.`}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {aggregateSessions.length > 0 && <button onClick={() => setCompareModal({ isOpen: true, quizId: session?.session_id || null, selectedSessionIds: selectedAggregateSession ? [selectedAggregateSession.id] : aggregateSessions.slice(0, 2).map((item) => item.id) })} className="inline-flex items-center gap-1.5 rounded-xl border border-[#0460A9]/20 bg-[#0460A9]/10 px-3.5 py-2 text-xs font-semibold text-[#0460A9] hover:bg-[#0460A9]/20">Compare sessions</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Sessions', value: displayMetrics.totalSessions, detail: selectedAggregateSession ? 'Selected run' : 'Quiz runs' },
                { label: 'Participants', value: displayMetrics.totalParticipants, detail: selectedAggregateSession ? 'In selected run' : 'Combined count' },
                { label: 'Average accuracy', value: displayMetrics.totalParticipants > 0 ? `${displayMetrics.avgAccuracy}%` : '—', detail: displayMetrics.totalParticipants > 0 ? (selectedAggregateSession ? 'Selected session' : `Session spread: ${displayMetrics.accuracySpread}%`) : 'No participant responses' },
                { label: 'Average score', value: displayMetrics.totalParticipants > 0 ? displayMetrics.avgScore : '—', detail: displayMetrics.totalParticipants > 0 ? `Response time: ${displayMetrics.avgTimeSeconds}s average` : 'No participant responses' },
              ].map((item) => <div key={item.label} className="rounded-2xl border border-[#0460A9]/10 bg-[#F8FAFC] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wide text-[#5D7EA1]">{item.label}</p><p className="mt-1 text-2xl font-extrabold text-[#16324F]">{item.value}</p><p className="text-[10px] text-[#5D7EA1]">{item.detail}</p></div>)}
            </div>
          </header>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <aside className="space-y-3 rounded-3xl border border-[#0460A9]/15 bg-white p-4 shadow-[0_4px_24px_rgba(4,96,169,0.04)] lg:col-span-3">
              <div className="border-b border-[#0460A9]/10 pb-3"><h2 className="text-sm font-bold text-[#16324F]">Session overview</h2><p className="mt-0.5 text-[11px] text-[#5D7EA1]">Search sessions or filter them by accuracy.</p></div>
              {selectedAggregateSession && <button onClick={() => setSelectedAggregateSessionId(null)} className="w-full rounded-lg border border-[#0460A9]/20 bg-[#0460A9]/10 px-3 py-2 text-xs font-semibold text-[#0460A9] hover:bg-[#0460A9]/20">Clear session filter · Show all sessions</button>}
              {aggregateSessions.length > 0 && <div className="space-y-2">
                <input type="search" value={aggregateSessionSearch} onChange={(event) => setAggregateSessionSearch(event.target.value)} placeholder="Search sessions..." aria-label="Search sessions" className="nq-report-control w-full rounded-xl border border-[#0460A9]/20 bg-white px-3 py-2 text-xs text-[#16324F] placeholder-[#5D7EA1] focus:outline-none focus:ring-2 focus:ring-[#0460A9]" />
                <select value={aggregateSessionFilter} onChange={(event) => setAggregateSessionFilter(event.target.value as typeof aggregateSessionFilter)} aria-label="Filter sessions by accuracy" className="nq-report-control w-full rounded-xl border border-[#0460A9]/20 bg-white px-3 py-2 text-xs text-[#16324F] focus:outline-none focus:ring-2 focus:ring-[#0460A9]">
                  <option value="all">All accuracy levels</option><option value="high">75% and above</option><option value="developing">50–74%</option><option value="review">Below 50%</option>
                </select>
              </div>}
              {aggregateSessions.length === 0 ? <p className="py-3 text-xs text-[#5D7EA1]">No sessions recorded yet.</p> : visibleAggregateSessions.length === 0 ? <p className="py-3 text-xs text-[#5D7EA1]">No sessions match your search and accuracy filter.</p> : visibleAggregateSessions.map((item, index) => (
                <button key={item.id} type="button" aria-pressed={selectedAggregateSessionId === item.id} onClick={() => setSelectedAggregateSessionId((current) => current === item.id ? null : item.id)} className={`w-full rounded-2xl border p-3 text-left transition hover:border-[#0460A9]/40 hover:shadow-sm ${selectedAggregateSessionId === item.id ? 'border-[#0460A9] bg-[#EBF3FA] ring-2 ring-[#0460A9]/20' : 'border-[#0460A9]/10 bg-[#F8FAFC]'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[#5D7EA1]">Session {index + 1}</p><h3 className="truncate text-xs font-bold text-[#16324F]">{item.name}</h3>
                  <p className="mt-1 text-[10px] text-[#5D7EA1]">{new Date(item.started_at).toLocaleDateString()} · {item.participantCount} participants</p>
                  <div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white p-2"><p className="text-[9px] uppercase text-[#5D7EA1]">Accuracy</p><p className={`text-sm font-bold ${item.avgAccuracy >= 75 ? 'text-emerald-700' : item.avgAccuracy >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>{item.avgAccuracy}%</p></div><div className="rounded-lg bg-white p-2"><p className="text-[9px] uppercase text-[#5D7EA1]">Avg score</p><p className="text-sm font-bold text-[#16324F]">{item.avgScore}</p></div></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${item.avgAccuracy >= 75 ? 'bg-emerald-500' : item.avgAccuracy >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.max(0, item.avgAccuracy))}%` }} /></div>
                </button>
              ))}
            </aside>

            <main className="space-y-5 lg:col-span-9">
              <ReportOverviewGraphs accuracy={displayMetrics.totalParticipants ? displayMetrics.avgAccuracy : null} players={[]} questions={effectiveQuestions} showDistribution={false} averageTime={displayMetrics.totalParticipants ? displayMetrics.avgTimeSeconds : null}><DemographicsPanel embedded sessionId={selectedAggregateSession?.id} quizId={session?.session_id} /></ReportOverviewGraphs>
              <TopicUnderstandingGraph
                items={displayTopics.map((topic) => ({
                  tag: topic.tag,
                  percentage: topic.maxPossibleUtility && topic.maxPossibleUtility > 0 ? topic.percentage : null,
                  earnedUtility: topic.earnedUtility ?? 0,
                  maxUtility: topic.maxPossibleUtility ?? 0,
                  responses: topic.sampleSize,
                  questionCount: 0,
                }))}
                description={selectedAggregateSession ? t('topic_breakdown.descriptions.session', { name: selectedAggregateSession.name }) : t('topic_breakdown.descriptions.aggregate')}
                selectedTag={selectedTag}
                onToggleTag={handleTagToggle}
              />
              <FilteredQuestionAnalysisTable
                questions={filteredQuestions}
                questionSearch={questionSearch}
                onQuestionSearchChange={setQuestionSearch}
                description={selectedAggregateSession ? `Question responses and utility scoring for ${selectedAggregateSession.name}.` : 'Question responses and utility scoring combined across all quiz sessions.'}
              />
            </main>
          </div>
        </div>
        {compareModal.isOpen && <CompareSessionsModal isOpen onClose={() => setCompareModal({ isOpen: false, quizId: null, selectedSessionIds: [] })} allQuizzes={effectiveQuizzes} allSessions={initialAllSessions?.length ? initialAllSessions : effectiveAllSessions.filter((item) => String(item.id) !== String(session?.id))} initialQuizId={compareModal.quizId} initialSelectedSessionIds={compareModal.selectedSessionIds} onLaunchCompare={(quizId, ids) => router.push(`/admin/quizzes/${quizId}/compare?sessions=${ids.join(',')}`)} />}
      </div>
    );
  }

  return (
    <div className="nq-full-report nq-report-canvas w-full text-[#16324F] font-sans antialiased p-3 sm:p-5 md:p-6 lg:p-8 space-y-6">

      {/* =============================================================
          1. TOP: SESSION OVERVIEW COMPONENT (Merged Single-View Header)
      ============================================================== */}
      <header className="w-full rounded-3xl bg-white border border-[#0460A9]/15 p-5 sm:p-6 shadow-[0_4px_24px_rgba(4,96,169,0.05)] space-y-5">

        {/* Row 1: Session Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#0460A9]/10 pb-4">
          <div className="flex items-start gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#0460A9]/15 bg-[#F8FAFC] text-xs font-semibold text-[#5D7EA1] hover:text-[#0460A9] hover:bg-[#EBF3FA] transition"
              >
                ← Back
              </button>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#EBF3FA] text-[#0460A9] border border-[#0460A9]/20">
                  <span className="w-2 h-2 rounded-full bg-[#0D8C6D] animate-ping" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0D8C6D] -ml-2.5" />
                  LIVE TELEMETRY
                </span>
                <span className="text-[11px] font-mono text-[#5D7EA1] tracking-wider uppercase">
                  {session?.id ? `SESSION: ${session.id}` : 'SESSION: —'}
                </span>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  REAL SESSION DATA
                </span>
                {session?.session_id && (
                  <button
                    onClick={() => router.push(`/admin/quizzes/${session.session_id}/analytics`)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0460A9] bg-[#0460A9]/10 hover:bg-[#0460A9]/20 border border-[#0460A9]/25 px-2.5 py-0.5 rounded-md transition"
                    title="View overall aggregated analytics across all sessions of this quiz template"
                  >
                    <span>✦ Quiz results</span>
                  </button>
                )}
                {selectedCompareSession && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md animate-fadeIn">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                    Comparing vs {selectedCompareSession.cohort_label || selectedCompareSession.name}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#16324F]">
                {sessionTitle}
              </h1>
              <p className="text-xs sm:text-sm text-[#5D7EA1] mt-0.5">
                Results, answers and AI summaries for each participant.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            {/* Session Compare Button (Matching QuizManage) */}
            <button
              onClick={() => {
                setCompareModal({
                  isOpen: true,
                  quizId: session?.session_id || null,
                  selectedSessionIds: session?.id ? [session.id] : [],
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all bg-[#0460A9]/10 text-[#0460A9] hover:bg-[#0460A9]/20 border border-[#0460A9]/20 shadow-2xs"
              title="Compare session with peers"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Compare</span>
            </button>


          </div>
        </div>

        {/* Row 1.5: ACTIVE SESSION BENCHMARK COMPARISON BANNER */}
        {selectedCompareSession && benchmarkComparisonMetrics && (
          <div className="nq-report-dark-panel rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-[#16324F] text-white p-4 sm:p-5 shadow-lg border border-indigo-500/30 space-y-3.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-700/50 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-300">
                      SESSION BENCHMARK COMPARISON (SAME QUIZ)
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      Session comparison
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-sky-300">{sessionTitle}</span>
                    <span className="text-gray-400 font-normal">vs</span>
                    <span className="text-amber-300">{selectedCompareSession.name}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => {
                    setCompareModal({
                      isOpen: true,
                      quizId: session?.session_id || null,
                      selectedSessionIds: session?.id ? [session.id] : [],
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/20 transition"
                >
                  ⇄ Switch Benchmark
                </button>
                <button
                  onClick={() => setSelectedCompareSession(null)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/80 hover:bg-rose-600 text-xs font-bold text-white transition shadow-sm"
                  title="Exit session comparison mode"
                >
                  ✕ Exit
                </button>
              </div>
            </div>

            {/* Benchmark Delta KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Delta 1: Audience Size */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Participants
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentParticipants} <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareParticipants}</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.participantDelta >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                    {benchmarkComparisonMetrics.participantDelta >= 0 ? `+${benchmarkComparisonMetrics.participantDelta}` : benchmarkComparisonMetrics.participantDelta} attendees
                  </span>
                </div>
              </div>

              {/* Delta 2: Guideline Accuracy */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Difference in correct answers
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentAccuracy}% <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareAccuracy}%</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.accuracyDelta >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                    {benchmarkComparisonMetrics.accuracyDelta >= 0 ? `+${benchmarkComparisonMetrics.accuracyDelta}% ↗` : `${benchmarkComparisonMetrics.accuracyDelta}% ↘`}
                  </span>
                </div>
              </div>

              {/* Delta 3: Mean Response time */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Response time
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentTime}s <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareTime}s</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.timeDelta <= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                    {benchmarkComparisonMetrics.timeDelta <= 0 ? `${Math.abs(benchmarkComparisonMetrics.timeDelta)}s faster` : `+${benchmarkComparisonMetrics.timeDelta}s slower`}
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        <ReportOverviewGraphs
          accuracy={selectedPlayer ? selectedPlayer.accuracy : activePlayersCount ? cohortAccuracy : null}
          players={selectedPlayer ? [selectedPlayer] : effectivePlayers}
          name={selectedPlayer?.displayName}
          questions={selectedPlayer ? effectiveQuestions.flatMap(q => {
            const response = q.userResponses[selectedPlayer.id];
            return response ? [{ ...q, errorRatePercent: response.isCorrect ? 0 : 100, sampleSize: 1, avgTimeSeconds: response.timeSeconds }] : [];
          }) : effectiveQuestions}
        ><div id="report-audience"><DemographicsPanel embedded sessionId={session?.id} /></div></ReportOverviewGraphs>
        <nav className={chartStyles.sections} aria-label="Report sections"><a href="#report-answers">Answers & AI recap</a><a href="#report-audience">Participant information</a></nav>
        {/* Row 4: Active Filter Chips Bar (With Click-to-Unfilter indicators) */}
        <div className="rounded-2xl bg-[#EBF3FA] border border-[#0460A9]/20 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#16324F] text-[11px] uppercase tracking-wider">
              Active Filters:
            </span>

            {/* Player Filter Chip */}
            {selectedPlayer ? (
              <button
                onClick={() => setSelectedPlayer(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-semibold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shadow-2xs group"
                title="Click again to unfilter player"
              >
                <span>👤 {selectedPlayer.displayName}</span>
                <span className="text-gray-400 group-hover:text-rose-700 font-mono">✕</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-[#0460A9]/10 text-[#5D7EA1] font-mono text-[11px]">
                All Players View
              </span>
            )}

            {/* Matrix Cell Filter Chip */}
            {selectedTag ? (
              <button
                onClick={() => { setSelectedTag(null); setSelectedLevel(null); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-semibold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shadow-2xs group"
                title="Click again to unfilter tag"
              >
                <span className="font-mono">{selectedTag}{selectedLevel ? ` × ${selectedLevel.toUpperCase()}` : ''}</span>
                <span className="text-gray-400 group-hover:text-rose-700 font-mono">✕</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-[#0460A9]/10 text-[#5D7EA1] font-mono text-[11px]">
                All Topics
              </span>
            )}
          </div>

          {/* Quick Clear All & Hint */}
          <div className="flex items-center gap-2">
            <span className="text-[#5D7EA1] text-[11px] hidden sm:inline italic">
              Click any selected filter item again to unfilter.
            </span>

            {(selectedPlayer || selectedTag) && (
              <button
                onClick={handleClearAllFilters}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-bold text-[11px] hover:bg-[#0460A9] hover:text-white transition shadow-2xs"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>

      </header>

      {/* =============================================================
          UNIFIED 2-COLUMN SECTION: (LEFT) LEADERBOARD | (RIGHT) HEATMAP & TABLE
      ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* -------------------------------------------------------------
            2. LEFT COMPONENT: LEADERBOARD WITH PLAYER SEARCH BAR
        -------------------------------------------------------------- */}
        {/* -------------------------------------------------------------
            2. LEFT COMPONENT: LEADERBOARD WITH PLAYER SEARCH BAR (COMPACT)
        -------------------------------------------------------------- */}
        <aside className="lg:col-span-3 xl:col-span-3 rounded-3xl bg-white border border-[#0460A9]/15 p-3.5 sm:p-4 shadow-[0_4px_24px_rgba(4,96,169,0.04)] space-y-3">

          <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0460A9]/10 text-[#0460A9]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </span>
                <h2 className="text-xs sm:text-sm font-bold text-[#16324F] tracking-tight">
                  Leaderboard
                </h2>
              </div>
            </div>

            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#EBF3FA] text-[#0460A9] border border-[#0460A9]/15">
              {filteredPlayers.length} Active
            </span>
          </div>

          {/* Session Cohort Switcher when in Compare Mode */}
          {selectedCompareSession && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
              <button
                onClick={() => { setActiveLeaderboardCohort('current'); setSelectedPlayer(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 ${activeLeaderboardCohort === 'current'
                  ? 'bg-[#0460A9] text-white shadow-xs'
                  : 'text-indigo-900 hover:bg-indigo-100/60'
                  }`}
              >
                <span>Current Session</span>
                <span className="font-mono opacity-80">({effectivePlayers.length})</span>
              </button>
              <button
                onClick={() => { setActiveLeaderboardCohort('compare'); setSelectedPlayer(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 ${activeLeaderboardCohort === 'compare'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-900 hover:bg-indigo-100/60'
                  }`}
              >
                <span>Comparison session</span>
                <span className="font-mono opacity-80">({selectedCompareSession.participant_count ?? 0})</span>
              </button>
            </div>
          )}

          {/* Player Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search player..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[#F8FAFC] border border-[#0460A9]/20 text-[#16324F] placeholder-[#5D7EA1] focus:outline-none focus:ring-2 focus:ring-[#0460A9] transition"
            />
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#5D7EA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {playerSearchQuery && (
              <button
                onClick={() => setPlayerSearchQuery('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#F8FAFC] border border-[#0460A9]/10 text-[10px]">
            <button
              onClick={() => setLeaderboardFilterTab('all')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'all'
                ? 'bg-white text-[#0460A9] shadow-2xs font-bold'
                : 'text-[#5D7EA1] hover:text-[#16324F]'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setLeaderboardFilterTab('gaps')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'gaps'
                ? 'bg-rose-50 text-rose-700 shadow-2xs font-bold border border-rose-200'
                : 'text-[#5D7EA1] hover:text-rose-700'
                }`}
            >
              Gaps
            </button>
            <button
              onClick={() => setLeaderboardFilterTab('high')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'high'
                ? 'bg-sky-50 text-sky-800 shadow-2xs font-bold border border-sky-200'
                : 'text-[#5D7EA1] hover:text-sky-800'
                }`}
            >
              Correct answers
            </button>
          </div>

          {/* "View All Players" Toggle Button */}
          <button
            onClick={() => setSelectedPlayer(null)}
            className={`w-full py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold flex items-center justify-between transition-all ${selectedPlayer === null
              ? 'bg-[#0460A9] text-white border-[#0460A9] shadow-xs'
              : 'bg-white text-[#5D7EA1] border-[#0460A9]/15 hover:bg-[#F8FAFC] hover:text-[#0460A9]'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedPlayer === null ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
              All Players
            </span>
            <span className="font-mono text-[9px] bg-black/10 px-1 py-0.2 rounded">
              Unfiltered
            </span>
          </button>

          {/* Scrollable Player Cards List */}
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredPlayers.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-[#5D7EA1]">
                No players match.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedPlayer?.id === player.id;

                return (
                  <div
                    key={player.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${player.displayName} · ${i18n.language?.startsWith('th') ? 'ดูสรุปจาก AI' : 'View AI summary'}`}
                    onClick={() => handlePlayerToggle(player)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlePlayerToggle(player); } }}
                    className={`w-full text-left rounded-xl border p-2 transition-all cursor-pointer relative group ${isSelected
                      ? 'bg-[#EBF3FA] border-[#0460A9] ring-2 ring-[#0460A9]/30 shadow-xs'
                      : 'bg-white border-[#0460A9]/10 hover:border-[#0460A9]/30 hover:bg-[#F8FAFC]'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold ${player.rank === 1
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : player.rank <= 3
                            ? 'bg-sky-100 text-sky-900 border border-sky-300'
                            : 'bg-gray-100 text-gray-700'
                          }`}>
                          #{player.rank}
                        </span>

                        <ProfileAvatar displayName={player.displayName} photoURL={player.photoUrl} size={24} />

                        <div className="min-w-0">
                          <div className="font-bold text-[11px] text-[#16324F] truncate group-hover:text-[#0460A9] transition-colors">
                            {player.displayName}
                          </div>
                        </div>
                      </div>

                      {/* Score & Accuracy */}
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-[11px] text-[#0460A9]">
                          {player.score} pts
                        </div>
                        <span className={`inline-block px-1 py-0.2 rounded font-mono text-[9px] font-bold ${player.accuracy >= 75
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : player.accuracy >= 50
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}>
                          {player.accuracy}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* -------------------------------------------------------------
            3. RIGHT COMPONENT: CLINICAL HEATMAP & QUESTION TABLE (EXPANDED)
        -------------------------------------------------------------- */}
        <main id="report-answers" className="lg:col-span-9 xl:col-span-9 space-y-6">

          {session?.id && <PlayerInsightPanel sessionId={session.id} player={selectedPlayer} th={i18n.language?.startsWith('th') ?? false} />}

          <TopicUnderstandingGraph
            items={availableTags.map((tag) => {
              const tagQuestions = effectiveQuestions.filter((question) => question.tags.includes(tag));
              const answeredQuestions = tagQuestions.filter((question) => question.sampleSize > 0);
              const playerResponses = selectedPlayer
                ? tagQuestions.flatMap((question) => question.userResponses[selectedPlayer.id] ? [question.userResponses[selectedPlayer.id]] : [])
                : [];
              const earnedUtility = selectedPlayer
                ? playerResponses.reduce((sum, response) => sum + response.utilityScore, 0)
                : answeredQuestions.reduce((sum, question) => sum + question.totalUtilityScore, 0);
              const maxUtility = selectedPlayer
                ? tagQuestions.reduce((sum, question) => sum + (question.userResponses[selectedPlayer.id] ? question.maxScore : 0), 0)
                : answeredQuestions.reduce((sum, question) => sum + question.maxScore * question.sampleSize, 0);
              const responses = selectedPlayer
                ? playerResponses.length
                : answeredQuestions.reduce((sum, question) => sum + question.sampleSize, 0);
              const percentage = maxUtility > 0
                ? Math.min(100, Math.max(0, Math.round((earnedUtility / maxUtility) * 100)))
                : null;
              return {
                tag,
                percentage,
                earnedUtility,
                maxUtility,
                responses,
                questionCount: tagQuestions.length,
                benchmarkPercentage: selectedCompareSession?.tag_scores?.[tag] ?? null,
              };
            })}
            description={selectedPlayer
              ? t('topic_breakdown.descriptions.player', { name: selectedPlayer.displayName })
              : selectedCompareSession
                ? t('topic_breakdown.descriptions.comparison', { name: selectedCompareSession.cohort_label || selectedCompareSession.name })
                : t('topic_breakdown.descriptions.report')}
            selectedPlayerName={selectedPlayer?.displayName}
            selectedCompareLabel={selectedCompareSession?.cohort_label || selectedCompareSession?.name}
            selectedTag={selectedTag}
            onToggleTag={handleTagToggle}
          />
          <FilteredQuestionAnalysisTable
            questions={filteredQuestions}
            questionSearch={questionSearch}
            onQuestionSearchChange={setQuestionSearch}
            selectedPlayer={selectedPlayer ? { id: selectedPlayer.id, displayName: selectedPlayer.displayName } : null}
            selectedCompareSession={selectedCompareSession}
          />

        </main>

      </div>

      {/* =============================================================
          MODAL: COMPARE SESSIONS (MATCHING QUIZMANAGE)
      ============================================================== */}
      <CompareSessionsModal
        isOpen={compareModal.isOpen}
        onClose={() => setCompareModal({ isOpen: false, quizId: null, selectedSessionIds: [] })}
        allQuizzes={effectiveQuizzes}
        allSessions={effectiveAllSessions}
        initialQuizId={compareModal.quizId}
        initialSelectedSessionIds={compareModal.selectedSessionIds}
        onLaunchCompare={(quizId, sessionIds) => {
          router.push(`/admin/quizzes/${quizId}/compare?sessions=${sessionIds.join(',')}`);
        }}
      />

    </div>
  );
}
