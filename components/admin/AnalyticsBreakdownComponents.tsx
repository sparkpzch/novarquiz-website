'use client';

import React, { useState } from 'react';
import { useTheme } from '@/lib/hooks/useTheme';
import RefreshButton from '@/components/ui/RefreshButton';

export interface TopicBreakdownItem {
  tag: string;
  percentage: number | null;
  earnedUtility: number;
  maxUtility: number;
  responses: number;
  questionCount: number;
  benchmarkPercentage?: number | null;
}

export interface AnalyticsQuestion {
  id: string;
  nodeCode: string;
  branchLabel: string;
  tags: string[];
  questionText: string;
  clinicalScenario: string;
  avgTimeSeconds: number;
  errorRatePercent: number;
  sampleSize: number;
  primaryDistractorKey: string;
  primaryDistractorSummary: string;
  pedagogicalAction: string;
  distractors: Array<{ key: string; text: string; percentage: number; isCorrect: boolean; utilityScore?: number; clinicalNote?: string }>;
  userResponses: Record<string, { selectedOption: string; isCorrect: boolean; utilityScore: number; timeSeconds: number }>;
}

export interface TopicUnderstandingBreakdownProps {
  items: TopicBreakdownItem[];
  description: string;
  selectedPlayerName?: string | null;
  selectedCompareLabel?: string | null;
  selectedTag?: string | null;
  onToggleTag?: (tag: string) => void;
  variant?: 'report' | 'dashboard';
  emptyMessage?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastFetchedAt?: number | null;
  refreshError?: boolean;
}

const TOPIC_META: Record<string, { description: string; icon: string }> = {
  '#SGLT2i-Dosage': { description: 'Cardio-Renal Protocol & Thresholds', icon: '🫀' },
  '#LDL-Targets': { description: 'Lipidology Goals & Risk Stratification', icon: '🧪' },
  '#HeartDisease-Symptoms': { description: 'Heart Failure Signs & Clinical Symptoms', icon: '🩺' },
  '#Nutrition-Guidelines': { description: 'Preventive Lifestyle & Dietary Management', icon: '🥗' },
};

export function TopicUnderstandingBreakdown({
  items,
  description,
  selectedPlayerName,
  selectedCompareLabel,
  selectedTag,
  onToggleTag,
  variant = 'report',
  emptyMessage = 'No topic tags are present in this report.',
  onRefresh,
  isRefreshing = false,
  lastFetchedAt = null,
  refreshError = false,
}: TopicUnderstandingBreakdownProps) {
  const dashboardVariant = variant === 'dashboard';
  const { theme: activeTheme } = useTheme();
  const dark = activeTheme === 'dark';
  const [sortBy, setSortBy] = useState<'lowest' | 'highest' | 'responses' | 'name'>('lowest');
  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'name') return a.tag.localeCompare(b.tag);
    if (sortBy === 'responses') return b.responses - a.responses || a.tag.localeCompare(b.tag);
    const aHasScore = a.percentage !== null && a.maxUtility > 0;
    const bHasScore = b.percentage !== null && b.maxUtility > 0;
    if (aHasScore !== bHasScore) return aHasScore ? -1 : 1;
    if (!aHasScore || !bHasScore) return a.tag.localeCompare(b.tag);
    const scoreOrder = (a.percentage ?? 0) - (b.percentage ?? 0);
    return (sortBy === 'lowest' ? scoreOrder : -scoreOrder) || a.tag.localeCompare(b.tag);
  });

  return (
    <section className={`nq-topic-breakdown space-y-4 ${dashboardVariant ? 'nq-dashboard-panel rounded-xl border border-white/8 bg-[#0d173e] p-4 sm:p-5' : 'rounded-3xl border border-[#0460A9]/15 bg-white p-4 shadow-[0_4px_24px_rgba(4,96,169,0.04)] sm:p-5'}`}>
      <div className={`flex flex-col gap-3 pb-3.5 sm:flex-row sm:items-center sm:justify-between ${dashboardVariant ? 'border-b border-white/8' : 'border-b border-[#0460A9]/10'}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${dashboardVariant ? 'bg-[#4f76ff]/15 text-[#91a7ff]' : 'bg-[#0460A9]/10 text-[#0460A9]'}`} aria-hidden="true">▦</span>
            <h2 className={`text-base font-bold tracking-tight sm:text-lg ${dashboardVariant ? 'text-white' : 'text-[#16324F]'}`}>Topic Understanding Breakdown</h2>
          </div>
          <p className={`mt-0.5 text-xs ${dashboardVariant ? 'text-[#9aa8d1]' : 'text-[#5D7EA1]'}`}>{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {dashboardVariant && onRefresh && (
            <RefreshButton
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
              lastFetchedAt={lastFetchedAt}
              refreshError={refreshError}
              theme={activeTheme}
            />
          )}
          <label className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${dashboardVariant ? 'text-[#9aa8d1]' : 'text-[#5D7EA1]'}`}>
            Sort
            <select aria-label="Sort topics" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal focus:outline-none focus:ring-2 ${dashboardVariant ? 'border-white/12 bg-[#0a1234] text-[#e4eaff] focus:ring-[#7898ff]' : 'nq-report-control border-[#0460A9]/20 bg-white text-[#16324F] focus:ring-[#0460A9]'}`}>
              <option value="lowest">Lowest utility</option>
              <option value="highest">Highest utility</option>
              <option value="responses">Most responses</option>
              <option value="name">Topic name</option>
            </select>
          </label>
          {selectedTag && onToggleTag && (
            <div className="flex items-center gap-2 rounded-xl border border-[#0460A9]/15 bg-[#F4F8FC] px-3 py-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">Filter:</span>
              <button onClick={() => onToggleTag(selectedTag)} className="inline-flex items-center gap-1 rounded border border-[#0460A9]/20 bg-white px-2 py-0.5 font-mono font-bold text-[#0460A9] hover:text-rose-700" title="Clear topic filter">
                {selectedTag} <span aria-hidden="true">×</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className={`rounded-xl p-4 text-xs ${dashboardVariant ? 'border border-white/8 bg-[#0a1234] text-[#9aa8d1]' : 'bg-[#F8FAFC] text-[#5D7EA1]'}`}>{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortedItems.map((item) => {
            const hasData = item.percentage !== null && item.maxUtility > 0;
            const score = item.percentage ?? 0;
            const meta = TOPIC_META[item.tag] ?? { description: item.tag.replace(/^#/, '').replace(/[-_]/g, ' '), icon: '📊' };
            const selected = selectedTag === item.tag;
            const tier = !hasData ? 'empty' : score < 50 ? 'priority' : score < 75 ? 'developing' : 'strong';
            const theme = {
              border: 'nq-topic-border', badge: 'nq-topic-badge', score: 'nq-topic-score',
              fill: !hasData ? '#737373' : score < 50 ? '#E11D48' : score < 75 ? '#D97706' : '#0284C7',
              track: dark ? '#404040' : '#E5E7EB',
              status: !hasData ? (item.responses > 0 ? 'No max utility' : 'No responses') : score < 50 ? 'Priority review' : score < 75 ? 'Developing' : 'Strong',
            };
            const radius = 15;
            const circumference = 2 * Math.PI * radius;

            return (
              <button
                key={item.tag}
                type="button"
                onClick={() => onToggleTag?.(item.tag)}
                disabled={!onToggleTag}
                aria-pressed={onToggleTag ? selected : undefined}
                data-tier={tier}
                title={onToggleTag ? (selected ? `Clear ${item.tag} filter` : `Filter questions by ${item.tag}`) : undefined}
                className={`nq-topic-card w-full overflow-hidden rounded-2xl border text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 ${dashboardVariant ? 'bg-[#0a1234]' : 'bg-white'} ${selected ? `ring-2 ring-[#0460A9]/40 shadow-md ${theme.border}` : `${theme.border} hover:shadow-md hover:border-[#0460A9]/30`} ${onToggleTag ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {selected && <div className="h-1 w-full" style={{ backgroundColor: theme.fill }} />}
                <div className={`nq-topic-content flex min-h-[112px] flex-col justify-between gap-2.5 p-3 ${dashboardVariant ? 'bg-white/[0.025]' : 'bg-[#F8FAFC]'}`}>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-sm">{meta.icon}</span>
                      <span className={`truncate rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${theme.badge}`}>{item.tag}</span>
                    </div>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${theme.badge}`}>{theme.status}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 pr-1">
                      <p className={`nq-topic-description line-clamp-2 text-xs font-semibold leading-tight ${dashboardVariant ? 'text-[#e4eaff]' : 'text-[#16324F]'}`}>{meta.description}</p>
                      <p className={`nq-topic-meta mt-1 truncate font-mono text-[11px] ${dashboardVariant ? 'text-[#9aa8d1]' : 'text-[#5D7EA1]'}`}>
                        {item.earnedUtility}/{item.maxUtility} utility · {item.responses} responses
                      </p>
                      {selectedPlayerName && <p className={`nq-topic-meta mt-0.5 truncate text-[11px] ${dashboardVariant ? 'text-[#9aa8d1]' : 'text-[#5D7EA1]'}`}>For {selectedPlayerName}</p>}
                      {selectedCompareLabel && item.benchmarkPercentage != null && <p className="mt-0.5 text-[9px] text-indigo-700">Compared with {selectedCompareLabel}: {item.benchmarkPercentage}%</p>}
                    </div>
                    <div className="relative flex shrink-0 items-center justify-center">
                      <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
                        <circle cx="19" cy="19" r={radius} fill="none" stroke={theme.track} strokeWidth="3.5" />
                        <circle cx="19" cy="19" r={radius} fill="none" stroke={theme.fill} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - (score / 100) * circumference} />
                      </svg>
                      <span className={`absolute text-[10px] font-extrabold font-mono ${theme.score}`}>{hasData ? `${score}%` : '—'}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className={`flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs ${dashboardVariant ? 'border-white/8 text-[#9aa8d1]' : 'border-[#0460A9]/10 text-[#5D7EA1]'}`}>
        <div className="flex flex-wrap items-center gap-3 text-[11px]"><span className={`font-bold ${dashboardVariant ? 'text-white' : 'text-[#16324F]'}`}>Tiers:</span><span>🔴 &lt;50% Priority review</span><span>🟠 50–74% Developing</span><span>🔵 ≥75% Strong</span></div>
        {onToggleTag && <span className="text-[11px] italic">Click a topic card to filter questions · click again to clear.</span>}
      </div>
    </section>
  );
}

export interface FilteredQuestionAnalysisTableProps {
  questions: AnalyticsQuestion[];
  questionSearch: string;
  onQuestionSearchChange: (value: string) => void;
  selectedPlayer?: { id: string; displayName: string } | null;
  selectedCompareSession?: {
    name: string;
    cohort_label?: string;
    node_error_rates?: Record<string, number>;
    node_avg_times?: Record<string, number>;
  } | null;
  description?: string;
}

export function FilteredQuestionAnalysisTable({
  questions,
  questionSearch,
  onQuestionSearchChange,
  selectedPlayer = null,
  selectedCompareSession = null,
  description,
}: FilteredQuestionAnalysisTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  return (
    <section className="rounded-3xl bg-white border border-[#0460A9]/15 p-5 sm:p-6 shadow-[0_4px_24px_rgba(4,96,169,0.04)] space-y-4">
      <div className="flex flex-col gap-3 border-b border-[#0460A9]/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-[#16324F]">
            <span>Filtered Question Analysis Table</span>
            <span className="rounded-md bg-[#EBF3FA] px-2 py-0.5 font-mono text-[11px] font-bold text-[#0460A9]">{questions.length} Items Listed</span>
            {selectedCompareSession && <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">Cross-Cohort Comparison</span>}
          </h3>
          <p className="mt-0.5 text-xs text-[#5D7EA1]">
            {description ?? (selectedPlayer
              ? `Showing responses and utility scores for ${selectedPlayer.displayName}.`
              : selectedCompareSession
                ? `Comparing question results with ${selectedCompareSession.cohort_label || selectedCompareSession.name}.`
                : 'Question-level response distribution and utility scoring.')}
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <input type="search" placeholder="Search questions or nodes..." value={questionSearch} onChange={(event) => onQuestionSearchChange(event.target.value)} className="w-full rounded-xl border border-[#0460A9]/20 bg-[#F8FAFC] py-2 pl-8 pr-3 text-xs text-[#16324F] placeholder-[#5D7EA1] focus:outline-none focus:ring-2 focus:ring-[#0460A9]" />
          <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#5D7EA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead><tr className="border-b border-[#0460A9]/15 bg-[#F8FAFC] font-mono text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">
            <th className="w-48 px-3 py-3">Branch View & Node</th><th className="min-w-[340px] px-3 py-3">Question Text & Context</th><th className="w-28 px-2 py-3 text-center">{selectedPlayer ? 'Time' : 'Avg Time'}</th><th className="w-36 px-2 py-3 text-center">{selectedPlayer ? 'Utility Result' : selectedCompareSession ? 'Accuracy Rate & Delta' : 'Accuracy Rate'}</th><th className="w-64 px-3 py-3">Distractor Breakdown</th><th className="w-24 px-3 py-3 text-right" />
          </tr></thead>
          <tbody className="divide-y divide-[#0460A9]/10 text-xs">
            {questions.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-xs text-[#5D7EA1]">No question nodes match the selected topic and search.</td></tr> : questions.map((question) => {
              const expanded = expandedRowId === question.id;
              const response = selectedPlayer ? question.userResponses[selectedPlayer.id] : null;
              const benchmarkError = selectedCompareSession?.node_error_rates?.[question.id];
              const benchmarkTime = selectedCompareSession?.node_avg_times?.[question.id];
              const accuracyRate = Math.max(0, Math.min(100, 100 - question.errorRatePercent));
              const benchmarkAccuracy = benchmarkError === undefined ? undefined : Math.max(0, Math.min(100, 100 - benchmarkError));
              const accuracyDelta = benchmarkAccuracy === undefined ? null : accuracyRate - benchmarkAccuracy;
              const selectedChoice = question.distractors.find((choice) => choice.key === response?.selectedOption);
              return <React.Fragment key={question.id}>
                <tr onClick={() => setExpandedRowId(expanded ? null : question.id)} className={`cursor-pointer transition-colors hover:bg-[#F4F8FC] ${expanded ? 'bg-[#F4F8FC]/80' : ''}`}>
                  <td className="px-3 py-3.5 align-top"><span className="inline-flex w-fit items-center rounded-md border border-[#0460A9]/20 bg-[#EBF3FA] px-2 py-0.5 font-mono text-[11px] font-bold text-[#0460A9]">{question.nodeCode}</span><div className="mt-1 truncate font-mono text-[10px] text-[#5D7EA1]">{question.branchLabel}</div></td>
                  <td className="min-w-[340px] max-w-xl px-3 py-3.5 align-top"><div className="text-xs font-semibold leading-relaxed text-[#16324F] sm:text-[13px]">{question.questionText}</div><div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#5D7EA1]"><span className="rounded bg-[#EBF3FA] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0460A9]">{question.tags.length ? question.tags.join(', ') : 'No topic tag'}</span>{question.clinicalScenario && question.clinicalScenario !== question.questionText && <span className="italic">{question.clinicalScenario}</span>}</div></td>
                  <td className="px-2 py-3.5 text-center align-top">{response ? <span className="font-mono text-xs font-bold text-[#16324F]">{response.timeSeconds}s</span> : <span className="font-mono text-xs font-bold text-[#16324F]">{question.avgTimeSeconds > 0 ? `${selectedCompareSession && benchmarkTime !== undefined ? `${question.avgTimeSeconds}s vs ${benchmarkTime}s` : `${question.avgTimeSeconds}s`}` : '—'}</span>}</td>
                  <td className="px-2 py-3.5 text-center align-top">{response ? <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${response.utilityScore < 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : response.utilityScore > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-[#0460A9]/20 bg-[#EBF3FA] text-[#0460A9]'}`}>{response.utilityScore} utility</span> : <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${accuracyRate < 50 ? 'border border-rose-200 bg-rose-50 text-rose-800' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{question.sampleSize > 0 ? `${accuracyRate}%${selectedCompareSession && benchmarkAccuracy !== undefined ? ` vs ${benchmarkAccuracy}% (${accuracyDelta! > 0 ? '+' : ''}${accuracyDelta}%)` : ''}` : '—'}</span>}</td>
                  <td className="px-3 py-3.5 align-top">{response ? <div className="space-y-1"><span className="rounded border border-[#0460A9]/20 bg-[#EBF3FA] px-2 py-0.5 font-mono text-[10px] font-bold text-[#0460A9]">Option {response.selectedOption}</span><p className="truncate text-[10px] text-[#5D7EA1]">{selectedChoice?.text || 'Selected answer'}</p></div> : <div className="space-y-1.5"><div className="flex h-2.5 w-full overflow-hidden rounded border border-gray-200 bg-gray-100">{question.distractors.map((choice) => <span key={choice.key} title={`${choice.key}: ${choice.percentage}%`} className={`h-full ${choice.isCorrect ? 'bg-[#0D8C6D]' : 'bg-rose-400/80'}`} style={{ width: `${Math.min(100, Math.max(0, choice.percentage))}%` }} />)}</div><div className="flex justify-between gap-2 text-[10px] text-[#5D7EA1]"><span className="truncate">Top distractor: {question.primaryDistractorKey || '—'}</span><span className="shrink-0">{question.sampleSize} answers</span></div></div>}</td>
                  <td className="px-3 py-3.5 text-right align-middle"><button className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${expanded ? 'border-[#0460A9] bg-[#0460A9] text-white' : 'border-[#0460A9]/20 bg-[#F4F8FC] text-[#0460A9] hover:bg-[#EBF3FA]'}`}>{expanded ? 'Hide' : 'Details'} <span aria-hidden="true">⌄</span></button></td>
                </tr>
                {expanded && <tr className="bg-[#F8FAFC]"><td colSpan={6} className="border-y border-[#0460A9]/10 p-4"><div className="space-y-3 rounded-2xl border border-[#0460A9]/15 bg-white p-4 shadow-2xs"><div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2"><span className="text-xs font-bold text-[#16324F]">Choice Distribution & Utility Scores</span><span className="font-mono text-[11px] text-[#5D7EA1]">Node: {question.nodeCode} · {question.branchLabel}</span></div>{question.distractors.length === 0 ? <p className="text-xs text-[#5D7EA1]">No answer choice data is available.</p> : <div className="space-y-1.5">{question.distractors.map((choice) => {
                  const selected = response?.selectedOption === choice.key;
                  return <div key={choice.key} className={`flex flex-col justify-between gap-2 rounded-xl border p-2 text-xs sm:flex-row sm:items-center ${selected ? 'border-[#0460A9] bg-[#EBF3FA]' : choice.isCorrect ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-gray-50'}`}><div className="flex items-start gap-2"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-bold ${choice.isCorrect ? 'bg-[#0D8C6D] text-white' : 'bg-gray-200 text-gray-800'}`}>{choice.key}</span><div><span className="font-medium text-[#16324F]">{choice.text}</span>{selectedPlayer && selected && <span className="ml-2 rounded bg-[#0460A9] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Selected by {selectedPlayer.displayName}</span>}{choice.clinicalNote && <div className="mt-0.5 text-[10px] italic text-rose-700">{choice.clinicalNote}</div>}</div></div><div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs font-bold">{question.sampleSize > 0 ? `${choice.percentage}%` : '—'}</span><span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${choice.utilityScore !== undefined && choice.utilityScore < 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : choice.utilityScore !== undefined && choice.utilityScore > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-100 text-gray-700'}`}>Utility: {choice.utilityScore ?? 0}</span></div></div>;
                })}</div>}<div className="flex items-start gap-2 rounded-xl border border-[#0460A9]/20 bg-[#EBF3FA] p-2.5 text-xs"><span className="font-bold text-[#0460A9]">Learning note:</span><span className="text-[#16324F]">{question.pedagogicalAction || 'No additional review note is available for this question.'}</span></div></div></td></tr>}
              </React.Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
