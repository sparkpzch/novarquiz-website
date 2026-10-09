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
  const [pickedQuizId, setSelectedQuizId] = useState<string>('');
  // Fall back to the first quiz until one is picked (quizzes may load after opening).
  const selectedQuizId = pickedQuizId || allQuizzes[0]?.id || '';
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');

  // Seed the selection when the modal opens — only on the closed→open
  // transition, so prop identity changes while open can't wipe the sessions
  // the user has already ticked. Starts false so mounting already-open counts.
  const [prevOpen, setPrevOpen] = useState(false);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      if (initialQuizId) setSelectedQuizId(initialQuizId);
      setSelectedSessionIds(initialSelectedSessionIds);
      setSearchFilter('');
      setStatusFilter('all');
    }
  }

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

  const canLaunch = selectedSessionIds.length >= 2;
  const statusTabs: Array<{ id: typeof statusFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
    { id: 'active', label: 'Active' },
  ];

  return typeof document !== 'undefined'
    ? createPortal(
        <div
          className="nq-report-compare-modal fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d2238]/45 p-4 animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-sessions-title"
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--nq-line)] bg-[var(--nq-panel)] text-[var(--nq-ink)] shadow-[0_12px_32px_-8px_rgba(22,50,79,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--nq-line)] px-5 py-4">
              <div>
                <h2 id="compare-sessions-title" className="font-display text-lg font-bold text-[var(--nq-ink)]">
                  Compare sessions
                </h2>
                <p className="mt-0.5 text-sm text-[var(--nq-muted)]">
                  Pick a quiz, then choose two or more of its sessions.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nq-muted)] transition-colors hover:bg-[var(--nq-inset)] hover:text-[var(--nq-ink)]"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Step 1: Select Quiz Template */}
              <div>
                <label htmlFor="compare-quiz-select" className="mb-1.5 block text-sm font-semibold text-[var(--nq-ink)]">
                  Quiz
                </label>
                <div className="relative">
                  <select
                    id="compare-quiz-select"
                    value={selectedQuizId}
                    onChange={(e) => {
                      setSelectedQuizId(e.target.value);
                      setSelectedSessionIds([]); // Reset session selection on quiz change
                    }}
                    className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--nq-line)] bg-[var(--nq-panel)] px-3 py-2.5 pr-10 text-sm font-medium text-[var(--nq-ink)] transition-all focus:border-[var(--nq-primary)] focus:bg-[var(--nq-panel)] focus:outline-none focus:ring-4 focus:ring-[var(--nq-primary)]/15"
                  >
                    <option value="" disabled>
                      Select a quiz
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
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[var(--nq-muted)]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {activeQuiz && activeQuiz.description && (
                  <p className="mt-1.5 line-clamp-1 text-xs text-[var(--nq-muted)]">
                    {activeQuiz.description}
                  </p>
                )}
              </div>

              {/* Step 2: Choose Sessions to Compare */}
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--nq-ink)]">Sessions</p>
                    <p className="text-xs text-[var(--nq-muted)]">Select at least 2.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedSessionIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="h-8 rounded-lg px-3 text-xs font-bold text-[var(--nq-muted)] transition-colors hover:bg-[var(--nq-inset)] hover:text-[var(--nq-ink)]"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      disabled={filteredSessions.length === 0}
                      className="h-8 rounded-lg border border-[var(--nq-line)] bg-[var(--nq-panel)] px-3 text-xs font-bold text-[var(--nq-accent-text)] transition-colors hover:border-[var(--nq-primary)]/40 hover:bg-[var(--nq-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--nq-line)] disabled:hover:bg-[var(--nq-panel)]"
                    >
                      Select All ({filteredSessions.length})
                    </button>
                  </div>
                </div>

                {/* Filters toolbar */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <input
                      type="text"
                      placeholder="Search by name or PIN…"
                      aria-label="Search sessions"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[var(--nq-line)] bg-[var(--nq-panel)] pl-9 pr-3 text-sm text-[var(--nq-ink)] placeholder:text-[var(--nq-muted)]/70 transition-all focus:border-[var(--nq-primary)] focus:bg-[var(--nq-panel)] focus:outline-none focus:ring-4 focus:ring-[var(--nq-primary)]/15"
                    />
                    <svg
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nq-muted)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  <div role="group" aria-label="Filter by status" className="flex h-9 items-center rounded-lg border border-[var(--nq-line)] bg-[var(--nq-inset)] p-1 text-xs font-bold">
                    {statusTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        aria-pressed={statusFilter === tab.id}
                        onClick={() => setStatusFilter(tab.id)}
                        className={`h-full rounded-md px-3 transition-all ${
                          statusFilter === tab.id
                            ? 'bg-[var(--nq-panel)] text-[var(--nq-accent-text)] shadow-sm'
                            : 'text-[var(--nq-muted)] hover:text-[var(--nq-ink)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sessions Checklist */}
                {sessionsForQuiz.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--nq-line)] bg-[var(--nq-inset)] px-6 py-7 text-center">
                    <p className="text-sm font-semibold text-[var(--nq-ink)]">This quiz has no sessions yet.</p>
                    <p className="mt-1 text-xs text-[var(--nq-muted)]">Run it at least twice to compare results.</p>
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--nq-line)] bg-[var(--nq-inset)] p-6 text-center text-xs text-[var(--nq-muted)]">
                    No sessions match your search.
                  </div>
                ) : (
                  <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                    {filteredSessions.map((session) => {
                      const isSelected = selectedSessionIds.includes(session.id);
                      const isCompleted = session.status === SESSION_STATUS.CLOSED || session.status === SESSION_STATUS.ARCHIVED;
                      const statusLabel = session.status
                        ? session.status.charAt(0).toUpperCase() + session.status.slice(1)
                        : 'Active';

                      return (
                        <div
                          key={session.id}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => toggleSession(session.id)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              toggleSession(session.id);
                            }
                          }}
                          className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--nq-primary)]/20 ${
                            isSelected
                              ? 'border-[var(--nq-primary)] bg-[var(--nq-accent-soft)]'
                              : 'border-[var(--nq-line)] bg-[var(--nq-panel)] hover:border-[var(--nq-primary)]/40 hover:bg-[var(--nq-inset)]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {/* Checkbox */}
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                                isSelected
                                  ? 'border-[var(--nq-primary)] bg-[var(--nq-primary)] text-white'
                                  : 'border-[var(--nq-line)] bg-[var(--nq-panel)] group-hover:border-[var(--nq-primary)]'
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
                                <h4 className="truncate text-sm font-bold text-[var(--nq-ink)]">
                                  {session.name || session.quiz_name || `Session #${session.id.slice(0, 8)}`}
                                </h4>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    isCompleted
                                      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-[var(--nq-accent-soft)] text-[var(--nq-accent-text)]'
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--nq-muted)]">
                                <span>
                                  {session.started_at
                                    ? new Date(session.started_at).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })
                                    : 'Date N/A'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-[var(--nq-ink)]">
                                  {session.play_count ?? 0} Participants
                                </span>
                                {session.avg_score !== undefined && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>Avg: <strong className="text-[var(--nq-ink)]">{session.avg_score} pts</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Cohort tag indicator */}
                          <div className="shrink-0 pl-2">
                            {isSelected && (
                              <span className="text-xs font-semibold text-[var(--nq-accent-text)]">
                                #{selectedSessionIds.indexOf(session.id) + 1}
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
            <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--nq-line)] px-5 py-3.5 sm:flex-row">
              <p className="text-sm text-[var(--nq-muted)]" aria-live="polite">
                {selectedSessionIds.length === 0
                  ? 'No sessions selected'
                  : selectedSessionIds.length === 1
                  ? '1 selected — pick one more'
                  : `${selectedSessionIds.length} selected`}
              </p>

              <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-lg border border-[var(--nq-line)] bg-[var(--nq-panel)] px-4 text-sm font-semibold text-[var(--nq-ink)] transition-colors hover:bg-[var(--nq-inset)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canLaunch}
                  onClick={handleLaunch}
                  title={canLaunch ? undefined : 'Select at least 2 sessions'}
                  className="h-9 rounded-lg bg-[var(--nq-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--nq-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--nq-primary)]"
                >
                  Compare
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
}
