'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Quiz, Session } from '@/lib/types';
import type { SessionComparisonItem } from './QuizSessionsCompareView';
import CompareSessionsModal, { type CompareSessionsModalProps } from './CompareSessionsModal';

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
    dominantArchetype: string;
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
  comparedSessions: SessionComparisonItem[];
  questions: Array<{
    id: string;
    question_text: string;
    node_type: string;
    totalResponses: number;
    errorRate: number;
    frictionScore: number;
    choices: Array<{
      label: string;
      text: string;
      score_impact: number;
      count: number;
      percentage: number;
      clinical_tags: string[];
      behavior_meaning?: string;
    }>;
    distractors: Array<{
      label: string;
      text: string;
      score_impact: number;
      count: number;
      percentage: number;
      clinical_tags: string[];
      behavior_meaning?: string;
    }>;
  }>;
  domainMastery: Array<{
    tag: string;
    percentage: number;
    sampleSize: number;
  }>;
}

export interface QuizOverallAnalyticsViewProps {
  data: QuizOverallAnalyticsData;
  allQuizzes?: Quiz[];
  allSessions?: CompareSessionsModalProps['allSessions'];
  onBack?: () => void;
}

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  '#SGLT2i-Dosage': 'SGLT2 Inhibitor initiation criteria, eGFR dosage titration, & cardiorenal safety thresholds',
  '#LDL-Targets': 'Very high-risk ASCVD intensive lipid lowering targets (<55 mg/dL) & combination therapy',
  '#HeartDisease-Symptoms': 'Early recognition of subtle HFpEF decompensation, NT-proBNP cutoff interpretation',
  '#Nutrition-Guidelines': 'Dietary sodium restriction, potassium management in CKD Stage 3b-4, and MNT',
};

export default function QuizOverallAnalyticsView({
  data,
  allQuizzes = [],
  allSessions = [],
  onBack,
}: QuizOverallAnalyticsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'domains' | 'archetypes' | 'questions' | 'sessions'>('overview');
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [selectedSessionIdsForCompare, setSelectedSessionIdsForCompare] = useState<string[]>([]);
  const [questionSearch, setQuestionSearch] = useState('');

  const { quiz, overall, sessions, comparedSessions, questions, domainMastery } = data;

  const filteredQuestions = useMemo(() => {
    if (!questionSearch.trim()) return questions;
    const q = questionSearch.toLowerCase();
    return questions.filter(
      (item) =>
        item.question_text.toLowerCase().includes(q) ||
        item.choices.some((c) => c.text.toLowerCase().includes(q)),
    );
  }, [questions, questionSearch]);

  const handleOpenCompareWithSessions = (sessionIds: string[]) => {
    setSelectedSessionIdsForCompare(sessionIds);
    setIsCompareModalOpen(true);
  };

  const handleLaunchDirectCompare = () => {
    if (sessions.length < 2) {
      handleOpenCompareWithSessions(sessions.map((s) => s.id));
      return;
    }
    const ids = sessions.map((s) => s.id).join(',');
    router.push(`/admin/quizzes/${quiz.id}/compare?sessions=${ids}`);
  };

  return (
    <div className="min-h-screen bg-[#F4F9FF] p-4 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-6">

        {/* Top Header & Navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack || (() => router.push('/admin?tab=quizzes-manager'))}
              className="group flex h-10 w-10 items-center justify-center rounded-2xl border border-[#0460A9]/15 bg-white text-[#5D7EA1] shadow-sm transition-all hover:border-[#0460A9] hover:bg-[#F4F9FF] hover:text-[#0460A9]"
              title="Return to Quizzes Manager"
            >
              <svg className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5D7EA1]">Quiz Template Analytics</span>
                <span className="rounded-full bg-[#0460A9]/10 px-2.5 py-0.5 text-[10px] font-extrabold text-[#0460A9]">
                  {overall.totalSessions} Sessions Aggregated
                </span>
                <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Consolidated Telemetry
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#16324F] mt-1">
                {quiz.name} — Overall Analytics
              </h1>
              <p className="text-xs sm:text-sm text-[#5D7EA1] mt-0.5 max-w-3xl">
                Consolidated multi-session statistics: Macro KPIs, cross-cohort accuracy progression, domain comprehension, and decision traps across all runs of this quiz.
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {sessions.length >= 2 && (
              <button
                onClick={handleLaunchDirectCompare}
                className="flex items-center gap-2 rounded-[20px] bg-[#0460A9] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#0460A9]/20 transition-all hover:bg-[#03508C]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Compare All Sessions ({sessions.length})
              </button>
            )}

            <button
              onClick={() => handleOpenCompareWithSessions(sessions.slice(0, 2).map((s) => s.id))}
              className="flex items-center gap-2 rounded-[20px] border border-[#0460A9]/20 bg-white px-4 py-2.5 text-xs font-bold text-[#0460A9] shadow-sm transition-all hover:bg-[#0460A9]/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Select Cohorts to Compare
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-[20px] bg-[#16324F] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#0d2238]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Export Report
            </button>
          </div>
        </div>

        {/* Executive Macro KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="nq-card rounded-[26px] p-5 shadow-sm border border-[#0460A9]/10 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
              Total Sessions Run
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#16324F]">{overall.totalSessions}</span>
              <span className="text-xs text-[#5D7EA1] font-semibold">cohorts</span>
            </div>
            <p className="mt-1 text-[11px] text-[#5D7EA1]">From template inception</p>
          </div>

          <div className="nq-card rounded-[26px] p-5 shadow-sm border border-[#0460A9]/10 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
              Total Clinicians Profiled
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#0460A9]">{overall.totalParticipants}</span>
              <span className="text-xs text-[#5D7EA1] font-semibold">players</span>
            </div>
            <p className="mt-1 text-[11px] text-[#5D7EA1]">Across all connected cohorts</p>
          </div>

          <div className="nq-card rounded-[26px] p-5 shadow-sm border border-[#0460A9]/10 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
              Overall Mean Accuracy
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-700">{overall.avgAccuracy}%</span>
              {overall.accuracySpread > 0 && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  ±{overall.accuracySpread}% spread
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#5D7EA1]">Weighted cohort mean</p>
          </div>

          <div className="nq-card rounded-[26px] p-5 shadow-sm border border-[#0460A9]/10 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
              Overall Mean Score
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#16324F]">{overall.avgScore}</span>
              <span className="text-xs text-[#5D7EA1] font-semibold">pts</span>
            </div>
            <p className="mt-1 text-[11px] text-[#5D7EA1]">Per clinician average</p>
          </div>

          <div className="nq-card rounded-[26px] p-5 shadow-sm border border-[#0460A9]/10 bg-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
              Avg Decision Velocity
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#7C3AED]">{overall.avgTimeSeconds}s</span>
              <span className="text-xs text-[#5D7EA1] font-semibold">/ node</span>
            </div>
            <p className="mt-1 text-[11px] text-[#5D7EA1]">Clinical response speed</p>
          </div>
        </div>

        {/* Hero Cross-Cohort Benchmark Banner */}
        <div className="nq-report-dark-panel rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-[#16324F] text-white p-5 sm:p-6 shadow-xl border border-indigo-500/30 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-700/50 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-md">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-300">
                  QUIZ TEMPLATE MACRO SYNTHESIS
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Cross-Cohort Clinical Performance Variance
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {overall.maxAccuracy > 0 && (
                <div className="rounded-xl bg-white/10 px-3 py-1.5 border border-white/15 text-xs text-indigo-100 flex items-center gap-2">
                  <span>Top Cohort: <strong className="text-emerald-300">{overall.maxAccuracy}%</strong></span>
                  <span>·</span>
                  <span>Baseline: <strong className="text-amber-300">{overall.minAccuracy}%</strong></span>
                </div>
              )}
              {sessions.length >= 2 && (
                <button
                  onClick={handleLaunchDirectCompare}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white transition shadow-sm"
                >
                  Side-by-Side Compare →
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
            <div className="rounded-2xl bg-white/5 p-3.5 border border-white/10 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Dominant Guideline Archetype</span>
              <p className="text-sm font-bold text-white">{overall.dominantArchetype}</p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Majority of attendees follow primary consensus protocols with high adherence across standard clinical nodes.
              </p>
            </div>

            <div className="rounded-2xl bg-white/5 p-3.5 border border-white/10 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Cohort Spread Delta</span>
              <p className="text-sm font-bold text-white">
                {overall.accuracySpread > 0 ? `${overall.accuracySpread}% Accuracy Spread` : 'Homogeneous Performance'}
              </p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                {overall.accuracySpread > 15
                  ? 'Significant inter-session disparity detected; targeted educational intervention recommended for trailing cohorts.'
                  : 'Consistent comprehension observed across parallel clinical cohorts.'}
              </p>
            </div>

            <div className="rounded-2xl bg-white/5 p-3.5 border border-white/10 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Template Friction Summary</span>
              <p className="text-sm font-bold text-white">{questions.length} Decision Nodes Tracked</p>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Aggregated distractor selections highlight common clinical inertia and guideline delay patterns.
              </p>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-[#0460A9]/10">
          <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                activeTab === 'overview'
                  ? 'border-[#0460A9] text-[#0460A9]'
                  : 'border-transparent text-[#5D7EA1] hover:border-gray-300 hover:text-[#16324F]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Executive Overview & Trends
            </button>

            <button
              onClick={() => setActiveTab('domains')}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                activeTab === 'domains'
                  ? 'border-[#0460A9] text-[#0460A9]'
                  : 'border-transparent text-[#5D7EA1] hover:border-gray-300 hover:text-[#16324F]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Clinical Domain Mastery
            </button>

            <button
              onClick={() => setActiveTab('archetypes')}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                activeTab === 'archetypes'
                  ? 'border-[#0460A9] text-[#0460A9]'
                  : 'border-transparent text-[#5D7EA1] hover:border-gray-300 hover:text-[#16324F]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              HCP Archetypes & Vectors
            </button>

            <button
              onClick={() => setActiveTab('questions')}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                activeTab === 'questions'
                  ? 'border-[#0460A9] text-[#0460A9]'
                  : 'border-transparent text-[#5D7EA1] hover:border-gray-300 hover:text-[#16324F]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Decision Traps & Questions ({questions.length})
            </button>

            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-3 text-xs font-bold transition-all ${
                activeTab === 'sessions'
                  ? 'border-[#0460A9] text-[#0460A9]'
                  : 'border-transparent text-[#5D7EA1] hover:border-gray-300 hover:text-[#16324F]'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              All Sessions Registry ({sessions.length})
            </button>
          </nav>
        </div>

        {/* TAB CONTENT: 1. OVERVIEW & TRENDS */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Session Progression Cards */}
            <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#0460A9]/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#16324F]">Cross-Session Progression Timeline</h3>
                  <p className="text-xs text-[#5D7EA1]">
                    Chronological performance comparison across all sessions conducted using this quiz template.
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#5D7EA1]">
                  Sorted chronologically
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#0460A9]/20 bg-[#F8FAFC] p-8 text-center">
                  <p className="text-sm font-bold text-[#16324F]">No sessions recorded for this quiz yet.</p>
                  <p className="mt-1 text-xs text-[#5D7EA1]">Launch sessions from Quizzes Manager to generate analytics.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s, idx) => (
                    <div
                      key={s.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#0460A9]/10 bg-[#F8FAFC] p-4 transition-all hover:bg-white hover:border-[#0460A9]/30 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0460A9]/10 text-xs font-bold text-[#0460A9]">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate text-sm font-bold text-[#16324F]">{s.name}</h4>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0460A9]">
                              {s.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#5D7EA1] flex flex-wrap items-center gap-2 mt-0.5">
                            <span>PIN: <strong className="font-mono text-[#16324F]">{s.pin_code || 'N/A'}</strong></span>
                            <span>•</span>
                            <span>{new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span>•</span>
                            <span>{s.participantCount} Attendees</span>
                          </div>
                        </div>
                      </div>

                      {/* Performance Bar */}
                      <div className="flex items-center gap-6 self-end sm:self-auto shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] font-semibold uppercase text-[#5D7EA1]">Accuracy</span>
                          <p className="text-base font-bold text-emerald-700">{s.avgAccuracy}%</p>
                        </div>

                        <div className="w-24 sm:w-32 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-2.5 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, s.avgAccuracy))}%` }}
                          />
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-semibold uppercase text-[#5D7EA1]">Avg Score</span>
                          <p className="text-base font-bold text-[#16324F]">{s.avgScore} pts</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/admin/sessions/${s.id}/analytics`)}
                            className="rounded-xl border border-[#0460A9]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#0460A9] hover:bg-[#0460A9]/10 transition"
                            title="View individual session analytics"
                          >
                            Report
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Distractor Traps Teaser */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-3">
                  <h3 className="text-base font-bold text-[#16324F]">Highest Friction Decision Nodes</h3>
                  <button
                    onClick={() => setActiveTab('questions')}
                    className="text-xs font-bold text-[#0460A9] hover:underline"
                  >
                    View All →
                  </button>
                </div>

                <div className="space-y-3">
                  {questions.slice(0, 3).map((q, idx) => (
                    <div key={q.id} className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#0460A9]/10 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-[#16324F] line-clamp-1">
                          #{idx + 1}. {q.question_text}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                          {q.errorRate}% Error
                        </span>
                      </div>
                      {q.distractors.length > 0 && (
                        <p className="text-[11px] text-[#5D7EA1]">
                          Top Trap: <strong>Option {q.distractors[0].label}</strong> chosen by {q.distractors[0].percentage}% of clinicians across all cohorts.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-3">
                  <h3 className="text-base font-bold text-[#16324F]">Clinical Domain Mastery Summary</h3>
                  <button
                    onClick={() => setActiveTab('domains')}
                    className="text-xs font-bold text-[#0460A9] hover:underline"
                  >
                    View Breakdown →
                  </button>
                </div>

                <div className="space-y-3">
                  {domainMastery.map((dm) => (
                    <div key={dm.tag} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#16324F]">{dm.tag}</span>
                        <span className="font-bold text-[#0460A9]">{dm.percentage}% Mastery</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#0460A9] h-2 rounded-full transition-all"
                          style={{ width: `${dm.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: 2. CLINICAL DOMAIN MASTERY */}
        {activeTab === 'domains' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
              <div className="border-b border-[#0460A9]/10 pb-4">
                <h3 className="text-lg font-bold text-[#16324F]">Consolidated Clinical Domain Telemetry</h3>
                <p className="text-xs text-[#5D7EA1]">
                  Aggregated guideline compliance across all question nodes tagged with specific therapeutic targets.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {domainMastery.map((dm) => {
                  const desc = DOMAIN_DESCRIPTIONS[dm.tag] || 'Comprehensive guideline sequence and management principles.';
                  return (
                    <div
                      key={dm.tag}
                      className="p-5 rounded-2xl border border-[#0460A9]/15 bg-[#F8FAFC] space-y-3 hover:bg-white hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-[#0460A9] bg-[#0460A9]/10 px-2.5 py-0.5 rounded-lg">
                            {dm.tag}
                          </span>
                          <h4 className="font-bold text-sm text-[#16324F] mt-2">
                            {dm.tag.replace('#', '').replace(/-/g, ' ')}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-extrabold text-[#0460A9]">{dm.percentage}%</span>
                          <span className="block text-[10px] text-[#5D7EA1]">Overall Mastery</span>
                        </div>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full ${
                            dm.percentage >= 70 ? 'bg-emerald-600' : dm.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${dm.percentage}%` }}
                        />
                      </div>

                      <p className="text-xs text-[#5D7EA1] leading-relaxed">{desc}</p>
                      <div className="pt-2 border-t border-[#0460A9]/10 flex items-center justify-between text-[11px] text-[#5D7EA1]">
                        <span>Sample Size: <strong>{dm.sampleSize} total responses</strong></span>
                        <span className={`font-bold ${dm.percentage >= 70 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {dm.percentage >= 70 ? 'Strong Adherence' : 'Educational Gap'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: 3. ARCHETYPES & VECTORS */}
        {activeTab === 'archetypes' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-6">
              <div className="border-b border-[#0460A9]/10 pb-4">
                <h3 className="text-lg font-bold text-[#16324F]">Clinician Behavioral Archetypes</h3>
                <p className="text-xs text-[#5D7EA1]">
                  Distribution of HCP practice patterns derived from question selections across all runs.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    title: 'Conservative Guideline Follower',
                    share: '38%',
                    color: 'text-blue-700 bg-blue-50 border-blue-200',
                    desc: 'Strict adherence to primary consensus pathways with high protocol consistency.',
                  },
                  {
                    title: 'Evidence-Seeking Early Adopter',
                    share: '28%',
                    color: 'text-purple-700 bg-purple-50 border-purple-200',
                    desc: 'Rapid integration of novel outcome trials and aggressive therapy intensification.',
                  },
                  {
                    title: 'Cautious Step-Wise Titrator',
                    share: '22%',
                    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                    desc: 'Prioritizes safety monitoring, conservative dosage ramps, and adverse effect mitigation.',
                  },
                  {
                    title: 'Emergent Clinical Innovator',
                    share: '12%',
                    color: 'text-amber-700 bg-amber-50 border-amber-200',
                    desc: 'Multidisciplinary case reasoning with proactive comorbid intervention.',
                  },
                ].map((arc) => (
                  <div key={arc.title} className="p-5 rounded-2xl border border-[#0460A9]/10 bg-[#F8FAFC] space-y-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold border ${arc.color}`}>
                      {arc.share} of Clinicians
                    </span>
                    <h4 className="font-bold text-sm text-[#16324F]">{arc.title}</h4>
                    <p className="text-xs text-[#5D7EA1] leading-relaxed">{arc.desc}</p>
                  </div>
                ))}
              </div>

              {/* Vector Meters */}
              <div className="border-t border-[#0460A9]/10 pt-6 space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#16324F]">
                  Aggregated Clinical Decision Vectors
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Protocol Strictness', value: 74, desc: 'Degree of adherence to published clinical guideline sequences' },
                    { label: 'Evidence Reliance', value: 68, desc: 'Frequency of selecting RCT-backed high-potency interventions' },
                    { label: 'Comorbid Proactivity', value: 59, desc: 'Readiness to initiate combination therapy early for high-risk profiles' },
                    { label: 'Conservative Escalation', value: 44, desc: 'Preference for conservative step-wise monitoring before dosage titration' },
                  ].map((v) => (
                    <div key={v.label} className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#0460A9]/10 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[#16324F]">{v.label}</span>
                        <span className="text-[#0460A9]">{v.value}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-[#0460A9] h-2 rounded-full" style={{ width: `${v.value}%` }} />
                      </div>
                      <p className="text-[11px] text-[#5D7EA1]">{v.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: 4. QUESTIONS & TRAPS */}
        {activeTab === 'questions' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0460A9]/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#16324F]">Decision Node Friction & Distractor Traps</h3>
                  <p className="text-xs text-[#5D7EA1]">
                    Consolidated error rates and top distractor choices selected across all sessions of this quiz.
                  </p>
                </div>
                <div className="relative min-w-[240px]">
                  <input
                    type="text"
                    placeholder="Search question nodes..."
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    className="w-full rounded-xl border border-[#0460A9]/15 bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs text-[#16324F] placeholder-[#8AA4C0] focus:border-[#0460A9] focus:bg-white focus:outline-none"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-[#8AA4C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              <div className="space-y-4">
                {filteredQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-[#0460A9]/15 bg-[#F8FAFC] p-5 space-y-4 transition-all hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#0460A9]/10 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-[#0460A9]/10 px-2 py-0.5 text-xs font-bold text-[#0460A9]">
                            Node #{idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-[#5D7EA1]">
                            {q.node_type || 'DECISION_NODE'}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#16324F] mt-1.5">{q.question_text}</h4>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] font-semibold uppercase text-[#5D7EA1]">Error Rate</span>
                          <p className={`text-base font-bold ${q.errorRate > 40 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {q.errorRate}%
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-semibold uppercase text-[#5D7EA1]">Friction Score</span>
                          <p className="text-base font-bold text-[#16324F]">{q.frictionScore}</p>
                        </div>
                      </div>
                    </div>

                    {/* Choices Distribution */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#5D7EA1]">
                        Consolidated Clinician Selections ({q.totalResponses} total answers):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.choices.map((c) => {
                          const isCorrect = c.score_impact > 0;
                          return (
                            <div
                              key={c.label}
                              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                                isCorrect
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 font-semibold'
                                  : 'bg-white border-[#0460A9]/10 text-[#16324F]'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="font-bold mr-1.5">{c.label}.</span>
                                <span className="truncate">{c.text}</span>
                                {c.behavior_meaning && (
                                  <p className="text-[10px] text-[#5D7EA1] mt-0.5 italic">{c.behavior_meaning}</p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-bold">{c.percentage}%</span>
                                <span className="block text-[10px] text-[#5D7EA1]">({c.count})</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: 5. ALL SESSIONS REGISTRY */}
        {activeTab === 'sessions' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="nq-card rounded-[32px] p-6 shadow-sm border border-[#0460A9]/10 bg-white space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0460A9]/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#16324F]">All Sessions Registry ({sessions.length})</h3>
                  <p className="text-xs text-[#5D7EA1]">
                    Complete index of individual session instances generated from this quiz template.
                  </p>
                </div>
                {sessions.length >= 2 && (
                  <button
                    onClick={handleLaunchDirectCompare}
                    className="flex items-center gap-1.5 rounded-xl bg-[#0460A9]/10 px-3.5 py-1.5 text-xs font-bold text-[#0460A9] hover:bg-[#0460A9]/20 transition"
                  >
                    Compare All ({sessions.length})
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[10px] uppercase font-bold text-[#5D7EA1] border-b border-[#0460A9]/10">
                    <tr>
                      <th className="py-3 px-4">Session Name</th>
                      <th className="py-3 px-4">PIN Code</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Attendees</th>
                      <th className="py-3 px-4 text-center">Accuracy</th>
                      <th className="py-3 px-4 text-center">Avg Score</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0460A9]/10">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-[#F8FAFC] transition">
                        <td className="py-3.5 px-4 font-bold text-[#16324F]">
                          {s.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#5D7EA1]">
                          {s.pin_code || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-[#5D7EA1]">
                          {new Date(s.started_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0460A9]">
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-[#16324F]">
                          {s.participantCount}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-700">
                          {s.avgAccuracy}%
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-[#16324F]">
                          {s.avgScore}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(`/admin/sessions/${s.id}/analytics`)}
                              className="rounded-lg bg-[#0460A9]/10 px-2.5 py-1 text-xs font-bold text-[#0460A9] hover:bg-[#0460A9]/20 transition"
                            >
                              Report
                            </button>
                            <button
                              onClick={() => handleOpenCompareWithSessions([s.id])}
                              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-[#5D7EA1] hover:bg-gray-200 transition"
                            >
                              Compare
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Compare Sessions Modal */}
      {isCompareModalOpen && (
        <CompareSessionsModal
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
          allQuizzes={allQuizzes.length > 0 ? allQuizzes : [quiz]}
          allSessions={allSessions.length > 0 ? allSessions : comparedSessions.map((c) => ({
            ...c.session,
            play_count: c.macroMetrics.participantCount,
            avg_score: c.macroMetrics.avgScore,
          }))}
          initialQuizId={quiz.id}
          initialSelectedSessionIds={selectedSessionIdsForCompare}
          onLaunchCompare={(qId, sIds) => {
            router.push(`/admin/quizzes/${qId}/compare?sessions=${sIds.join(',')}`);
          }}
        />
      )}
    </div>
  );
}
