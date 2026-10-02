'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quiz, Session } from '@/lib/types';
import { SESSION_STATUS } from '@/lib/constants/session';

export interface CompareSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allQuizzes: Quiz[];
  allSessions: (Session & { quiz_name?: string; play_count?: number; avg_score?: number; raw_session_name?: string | null })[];
  initialQuizId?: string | null;
  initialSelectedSessionIds?: string[];
  onLaunchCompare?: (quizId: string, sessionIds: string[]) => void;
}

export default function CompareSessionsModal({
  isOpen,
  onClose,
  allQuizzes,
  allSessions,
  initialQuizId,
  initialSelectedSessionIds = [],
  onLaunchCompare,
}: CompareSessionsModalProps) {
  const router = useRouter();
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');

  // Sync state when modal opens or initial values change
  useEffect(() => {
    if (isOpen) {
      if (initialQuizId) {
        setSelectedQuizId(initialQuizId);
      } else if (allQuizzes.length > 0 && !selectedQuizId) {
        setSelectedQuizId(allQuizzes[0].id);
      }
      if (initialSelectedSessionIds && initialSelectedSessionIds.length > 0) {
        setSelectedSessionIds(initialSelectedSessionIds);
      } else {
        setSelectedSessionIds([]);
      }
    }
  }, [isOpen, initialQuizId, initialSelectedSessionIds, allQuizzes]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter available quizzes to only those that have at least 1 session
  const quizzesWithSessions = useMemo(() => {
    return allQuizzes.map((q) => {
      const sessionCount = allSessions.filter((s) => String(s.session_id) === String(q.id)).length;
      return { ...q, sessionCount };
    });
  }, [allQuizzes, allSessions]);

  // Current active quiz object
  const activeQuiz = useMemo(() => {
    return allQuizzes.find((q) => String(q.id) === String(selectedQuizId)) || null;
  }, [allQuizzes, selectedQuizId]);

  // Sessions for currently selected quiz
  const sessionsForQuiz = useMemo(() => {
    if (!selectedQuizId) return [];
    return allSessions.filter((s) => String(s.session_id) === String(selectedQuizId));
  }, [allSessions, selectedQuizId]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessionsForQuiz.filter((s) => {
      if (statusFilter === 'completed' && s.status !== SESSION_STATUS.CLOSED && s.status !== SESSION_STATUS.ARCHIVED) {
        return false;
      }
      if (statusFilter === 'active' && s.status !== SESSION_STATUS.STARTED && s.status !== SESSION_STATUS.OPENED) {
        return false;
      }
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const name = (s.name || s.quiz_name || '').toLowerCase();
        const pin = (s.pin_code || '').toLowerCase();
        return name.includes(query) || pin.includes(query);
      }
      return true;
    });
  }, [sessionsForQuiz, searchFilter, statusFilter]);

  const toggleSession = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredSessions.map((s) => s.id);
    setSelectedSessionIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => {
    setSelectedSessionIds([]);
  };

  const handleLaunch = () => {
    if (selectedSessionIds.length < 2) return;
    if (onLaunchCompare && selectedQuizId) {
      onLaunchCompare(selectedQuizId, selectedSessionIds);
    } else if (selectedQuizId) {
      router.push(`/admin/quizzes/${selectedQuizId}/compare?sessions=${selectedSessionIds.join(',')}`);
    }
    onClose();
  };

  if (!isOpen) return null;

  return typeof document !== 'undefined'
    ? createPortal(
        <div className="nq-report-compare-modal fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d2238]/60 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[32px] border border-white/20 bg-white shadow-[0_25px_60px_-15px_rgba(4,96,169,0.3)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#0460A9]/10 bg-gradient-to-r from-[#F4F9FF] to-[#EBF3FB] p-6">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0460A9] text-white shadow-md shadow-[#0460A9]/25">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#0460A9]/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0460A9]">
                      Macro Comparison
                    </span>
                    <span className="text-xs font-semibold text-[#5D7EA1]">Session comparison</span>
                  </div>
                  <h2 className="mt-0.5 text-2xl font-bold text-[#16324F]">Compare Quiz Sessions</h2>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-[#5D7EA1] transition-colors hover:bg-black/5 hover:text-[#16324F]"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Step 1: Select Quiz Template */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#5D7EA1]">
                  1. Select Quiz Template
                </label>
                <div className="relative">
                  <select
                    value={selectedQuizId}
                    onChange={(e) => {
                      setSelectedQuizId(e.target.value);
                      setSelectedSessionIds([]); // Reset session selection on quiz change
                    }}
                    className="w-full appearance-none rounded-2xl border border-[#0460A9]/20 bg-[#F8FAFC] px-4 py-3.5 pr-10 text-sm font-semibold text-[#16324F] shadow-sm transition-all focus:border-[#0460A9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0460A9]/20"
                  >
                    <option value="" disabled>
                      Select a Quiz Template
                    </option>
                    {quizzesWithSessions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name} ({q.sessionCount} session{q.sessionCount === 1 ? '' : 's'})
                      </option>
                    ))}
                    {selectedQuizId && !quizzesWithSessions.some((q) => String(q.id) === String(selectedQuizId)) && (
                      <option value={selectedQuizId}>
                        {activeQuiz?.name || 'Selected Quiz'} ({sessionsForQuiz.length} session{sessionsForQuiz.length === 1 ? '' : 's'})
                      </option>
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#5D7EA1]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {activeQuiz && activeQuiz.description && (
                  <p className="mt-1.5 text-xs text-[#5D7EA1] line-clamp-1 italic">
                    {activeQuiz.description}
                  </p>
                )}
              </div>

              {/* Step 2: Choose Sessions to Compare */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#5D7EA1]">
                      2. Choose Sessions to Compare
                    </label>
                    <p className="text-xs text-[#5D7EA1]">
                      Select at least 2 sessions to compare results.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      disabled={filteredSessions.length === 0}
                      className="rounded-lg bg-[#0460A9]/5 px-2.5 py-1 text-xs font-bold text-[#0460A9] transition-colors hover:bg-[#0460A9]/15 disabled:opacity-40"
                    >
                      Select All ({filteredSessions.length})
                    </button>
                    {selectedSessionIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-[#5D7EA1] transition-colors hover:bg-gray-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Filters toolbar */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <input
                      type="text"
                      placeholder="Search sessions..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full rounded-xl border border-[#0460A9]/15 bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs text-[#16324F] placeholder-[#8AA4C0] focus:border-[#0460A9] focus:bg-white focus:outline-none"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-4 w-4 text-[#8AA4C0]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  <div className="flex rounded-xl bg-[#F0F4F8] p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className={`rounded-lg px-3 py-1 transition-all ${statusFilter === 'all' ? 'bg-white text-[#16324F] shadow-sm' : 'text-[#5D7EA1] hover:text-[#16324F]'}`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('completed')}
                      className={`rounded-lg px-3 py-1 transition-all ${statusFilter === 'completed' ? 'bg-white text-[#16324F] shadow-sm' : 'text-[#5D7EA1] hover:text-[#16324F]'}`}
                    >
                      Completed
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('active')}
                      className={`rounded-lg px-3 py-1 transition-all ${statusFilter === 'active' ? 'bg-white text-[#16324F] shadow-sm' : 'text-[#5D7EA1] hover:text-[#16324F]'}`}
                    >
                      Active
                    </button>
                  </div>
                </div>

                {/* Sessions Checklist */}
                {sessionsForQuiz.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#0460A9]/20 bg-[#F8FAFC] p-8 text-center">
                    <p className="text-sm font-bold text-[#16324F]">No sessions found for this quiz template.</p>
                    <p className="mt-1 text-xs text-[#5D7EA1]">At least 2 sessions are needed to compare results.</p>
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="rounded-2xl bg-[#F8FAFC] p-6 text-center text-xs text-[#5D7EA1]">
                    No sessions match your search filter.
                  </div>
                ) : (
                  <div className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">
                    {filteredSessions.map((session, index) => {
                      const isSelected = selectedSessionIds.includes(session.id);
                      const isCompleted = session.status === SESSION_STATUS.CLOSED || session.status === SESSION_STATUS.ARCHIVED;
                      
                      return (
                        <div
                          key={session.id}
                          onClick={() => toggleSession(session.id)}
                          className={`group flex cursor-pointer items-center justify-between rounded-2xl border p-3.5 transition-all ${
                            isSelected
                              ? 'border-[#0460A9] bg-[#F4F9FF] shadow-sm shadow-[#0460A9]/10'
                              : 'border-[#0460A9]/10 bg-white hover:border-[#0460A9]/30 hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Checkbox */}
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                                isSelected
                                  ? 'border-[#0460A9] bg-[#0460A9] text-white'
                                  : 'border-[#8AA4C0] bg-white group-hover:border-[#0460A9]'
                              }`}
                            >
                              {isSelected && (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="truncate text-sm font-bold text-[#16324F]">
                                  {session.name || session.quiz_name || `Session #${session.id.slice(0, 8)}`}
                                </h4>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    isCompleted
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-blue-50 text-[#0460A9]'
                                  }`}
                                >
                                  {session.status || 'Active'}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-[#5D7EA1]">
                                <span>
                                  {session.started_at
                                    ? new Date(session.started_at).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })
                                    : 'Date N/A'}
                                </span>
                                <span>•</span>
                                <span className="font-semibold text-[#16324F]">
                                  {session.play_count ?? 0} Participants
                                </span>
                                {session.avg_score !== undefined && (
                                  <>
                                    <span>•</span>
                                    <span>Avg: <strong className="text-[#16324F]">{session.avg_score} pts</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Cohort tag indicator */}
                          <div className="shrink-0 pl-2">
                            {isSelected && (
                              <span className="rounded-full bg-[#0460A9] px-2 py-0.5 text-[10px] font-extrabold text-white">
                                Cohort #{selectedSessionIds.indexOf(session.id) + 1}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#0460A9]/10 bg-[#F8FAFC] p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0460A9]/10 text-xs font-bold text-[#0460A9]">
                  {selectedSessionIds.length}
                </span>
                <span className="text-xs font-semibold text-[#16324F]">
                  {selectedSessionIds.length === 0
                    ? 'No sessions selected'
                    : selectedSessionIds.length === 1
                    ? '1 session selected (select at least 2)'
                    : `${selectedSessionIds.length} sessions selected for comparison`}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[18px] border border-[#0460A9]/20 bg-white px-5 py-2.5 text-sm font-semibold text-[#5D7EA1] transition-all hover:bg-[#F0F4F8] hover:text-[#16324F]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedSessionIds.length < 2}
                  onClick={handleLaunch}
                  className={`flex items-center gap-2 rounded-[18px] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all ${
                    selectedSessionIds.length >= 2
                      ? 'bg-[#0460A9] shadow-[#0460A9]/25 hover:bg-[#03508C] hover:scale-[1.02]'
                      : 'cursor-not-allowed bg-[#8AA4C0] opacity-60'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Launch Comparison
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
}
