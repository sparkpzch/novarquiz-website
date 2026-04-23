'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import type { Question, LeaderboardEntry } from '@/lib/types';
import { updateScore, watchScores, untrackAllUserSessionsFor, type PlayerScore } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';

const CHOICE_COLORS = { A: 'from-red-600 to-red-500', B: 'from-blue-600 to-blue-500', C: 'from-emerald-600 to-emerald-500', D: 'from-amber-600 to-amber-500' };
const CHOICE_HOVERS = { A: 'hover:from-red-500 hover:to-red-400', B: 'hover:from-blue-500 hover:to-blue-400', C: 'hover:from-emerald-500 hover:to-emerald-400', D: 'hover:from-amber-500 hover:to-amber-400' };

export default function QuestionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  const [question, setQuestion] = useState<Question | null>(null);
  // Soft per-question cap (count-up timer expires here = no answer recorded,
  // 0 points awarded). Defaults to session.timer_seconds; questions can override.
  const [timerCap, setTimerCap] = useState(30);
  const [elapsed, setElapsed] = useState(0); // seconds since question shown — count-up
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0); // consecutive answers with points > 0
  const [selected, setSelected] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null); // toast: "+5" / "−2"
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [nextLoading, setNextLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  // Guards POST /complete from running twice if the finished view re-mounts.
  const completedRef = useRef(false);

  // Subscribe to live leaderboard for this session
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    return watchScores(sessionId, setScores);
  }, [sessionId, user]);

  const isSituation = question?.node_type === 'situation';

  const applyQuestion = useCallback((q: Question) => {
    setQuestion(q);
    const cap = q.timer_override || 30;
    setTimerCap(cap);
    setElapsed(0);
    setSelected(null);
    setLastDelta(null);
    setQuestionStartTime(Date.now());

    // Broadcast our current question to RTDB so admin observation can show
    // where each player is. Skipped for guests.
    if (user && !user.isAnonymous) {
      const label = q.question_text?.slice(0, 40) || `Q${q.question_order + 1}`;
      updateScore(sessionId, user, score, {
        currentQuestionId: q.id,
        currentQuestionLabel: label,
      }).catch(() => { /* non-fatal */ });
    }

    trackEvent('question_viewed', {
      session_id: sessionId,
      question_id: q.id,
      node_type: q.node_type,
      question_order: q.question_order,
    });
  }, [sessionId, user, score]);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/play/${sessionId}/answer?entry=true`);
      if (!res.ok) { setFinished(true); return; }
      const data = await res.json();
      if (!data?.id) { setFinished(true); return; }
      applyQuestion(data);
    } catch { setFinished(true); }
    finally { setLoading(false); }
  }, [sessionId, applyQuestion]);

  useEffect(() => { loadQuestion(); }, [loadQuestion]);

  // Count-up timer — increments every second until cap. On expiry: no answer
  // is recorded; we navigate to the end (treated as session abandoned/timeout).
  useEffect(() => {
    if (loading || finished || selected || isSituation) return;
    const interval = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= timerCap) {
          clearInterval(interval);
          setStreak(0);
          trackEvent('question_timeout', { session_id: sessionId, question_id: question?.id });
          setTimeout(() => setFinished(true), 800);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, finished, selected, isSituation, question?.id, timerCap, sessionId]);

  const goToNext = async (fromQuestionId: string, choiceLabel: string) => {
    try {
      const res = await fetch(`/api/play/${sessionId}/answer?fromQuestionId=${fromQuestionId}&choiceLabel=${choiceLabel}`);
      if (!res.ok) { setFinished(true); return; }
      const next = await res.json();
      if (!next?.id) { setFinished(true); return; }
      applyQuestion(next);
    } catch { setFinished(true); }
  };

  const handleAnswer = async (label: string) => {
    if (selected || !question || !user) return;
    setSelected(label);
    const timeTaken = Date.now() - questionStartTime;

    // Server is source of truth for points — never trust client-side scoring.
    let pointsAwarded = 0;
    try {
      const res = await fetch(`/api/play/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          question_id: question.id,
          chosen_label: label,
          time_taken_ms: timeTaken,
          is_guest: user.isAnonymous,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        pointsAwarded = (data?.points_earned as number | undefined) ?? 0;
      }
    } catch { /* offline-tolerant: 0 points awarded */ }

    // Guests don't get server-side scoring — fall back to the choice's
    // local points value so their UI still updates.
    if (user.isAnonymous) {
      pointsAwarded = question.choices.find(c => c.label === label)?.points ?? 0;
    }

    const nextScore = score + pointsAwarded;
    setScore(nextScore);
    setLastDelta(pointsAwarded);
    setStreak(prev => pointsAwarded > 0 ? prev + 1 : 0);

    trackEvent('choice_selected', {
      session_id: sessionId,
      question_id: question.id,
      choice_label: label,
      points_earned: pointsAwarded,
      time_taken_ms: timeTaken,
    });

    // Broadcast running score so other players (and admin) see live updates.
    if (!user.isAnonymous) {
      const label2 = question.question_text?.slice(0, 40) || `Q${question.question_order + 1}`;
      updateScore(sessionId, user, nextScore, {
        currentQuestionId: question.id,
        currentQuestionLabel: label2,
      }).catch(() => { /* non-fatal */ });
    }

    // Brief pause so the player sees the +N / −N feedback, then advance.
    await new Promise(r => setTimeout(r, 800));
    await goToNext(question.id, label);
  };

  const handleNext = async () => {
    if (!question || nextLoading) return;
    setNextLoading(true);
    await goToNext(question.id, 'continue');
    setNextLoading(false);
  };

  // When the player reaches the end: aggregate their answers into
  // leaderboard_entries (server-side) and fetch the resulting board.
  useEffect(() => {
    if (!finished || !user || completedRef.current) return;
    completedRef.current = true;

    (async () => {
      // Mark "finished" in RTDB so the admin grid can render a done badge
      // and the dashboard live-session widget removes this entry.
      if (!user.isAnonymous) {
        updateScore(sessionId, user, score, { finished: true, currentQuestionId: null }).catch(() => {});
        // Clear every live-session entry for this session (public lobby +
        // any team-room entries) so the dashboard widget drops it.
        untrackAllUserSessionsFor(user.uid, sessionId).catch(() => {});
      }

      trackEvent('session_completed', { session_id: sessionId, final_score: score });

      try {
        await fetch(`/api/play/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.uid,
            user_display_name: user.displayName,
            user_photo_url: user.photoURL,
            is_guest: user.isAnonymous,
          }),
        });
      } catch { /* non-fatal — leaderboard fetch may still succeed */ }

      try {
        const res = await fetch(`/api/play/${sessionId}/leaderboard`);
        if (res.ok) setLeaderboard(await res.json());
      } catch { /* fall through with null */ }
    })();
  }, [finished, user, sessionId, score]);

  // ── Finished view: aggregate score + leaderboard ────────────────────────────
  if (finished) {
    const board = leaderboard ?? [];
    const top10 = board.slice(0, 10);
    const myRankIdx = user ? board.findIndex(e => e.user_id === user.uid) : -1;
    const myEntry = myRankIdx >= 0 ? board[myRankIdx] : null;
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;

    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-5"
        >
          <div className="text-center">
            <span className="text-5xl">🎉</span>
            <h1 className="text-2xl font-bold text-white mt-3">{t('play.finished')}</h1>
          </div>

          {/* Personal score panel */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-600/15 to-purple-600/10 p-6 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{t('play.score')}</p>
            <p className="text-5xl font-bold text-white mt-2">{score}</p>
            {myRank && (
              <p className="text-sm text-indigo-300 mt-2">
                Rank <span className="font-bold">#{myRank}</span> of {board.length}
              </p>
            )}
          </div>

          {/* Top 10 leaderboard */}
          {leaderboard === null ? (
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center text-gray-500 text-sm">
              <div className="w-5 h-5 mx-auto border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
              Loading leaderboard…
            </div>
          ) : top10.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center text-gray-500 text-sm">
              You're the first to finish — share your score!
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">🏆 Leaderboard</h2>
                <span className="text-xs text-gray-500">{board.length} player{board.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                {top10.map((entry, idx) => {
                  const isMe = user && entry.user_id === user.uid;
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-indigo-500/10' : ''}`}
                    >
                      <span className="w-6 text-center text-sm font-bold text-gray-400">
                        {medal ?? `#${idx + 1}`}
                      </span>
                      <span className={`flex-1 text-sm truncate ${isMe ? 'text-indigo-300 font-semibold' : 'text-gray-200'}`}>
                        {isMe ? 'You' : entry.user_display_name}
                      </span>
                      <span className="text-white font-bold tabular-nums">{entry.total_score}</span>
                    </div>
                  );
                })}
              </div>
              {/* Show own row if outside top 10 */}
              {myEntry && myRankIdx >= 10 && (
                <div className="border-t border-white/5 px-4 py-2.5 bg-indigo-500/10 flex items-center gap-3">
                  <span className="w-6 text-center text-sm font-bold text-indigo-300">#{myRank}</span>
                  <span className="flex-1 text-sm text-indigo-300 font-semibold">You</span>
                  <span className="text-white font-bold tabular-nums">{myEntry.total_score}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => router.push(`/history?session=${sessionId}`)} className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-500 hover:to-purple-500 transition-colors">
              Full Leaderboard
            </button>
            <button onClick={() => router.push('/')} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors">Home</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading || !question) {
    return <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  // ── Situation node view ──────────────────────────────────────────────────────
  if (isSituation) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col">
        {/* Media — takes up all available space */}
        <div className="flex-1 flex items-center justify-center">
          {question.media_url ? (
            question.media_type === 'video' ? (
              <video
                src={question.media_url}
                autoPlay
                controls
                className="w-full h-full object-contain max-h-[calc(100vh-120px)]"
                style={{ background: '#000' }}
              />
            ) : (
              <img
                src={question.media_url}
                alt="Scene"
                className="w-full h-full object-contain max-h-[calc(100vh-120px)]"
                style={{ background: '#000' }}
              />
            )
          ) : (
            <div className="text-gray-600 text-center">
              <div style={{ fontSize: 64 }}>🎬</div>
              <p className="mt-3">No media</p>
            </div>
          )}
        </div>

        {/* Next button */}
        <div className="p-6 flex justify-center flex-shrink-0">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleNext}
            disabled={nextLoading}
            className="w-full max-w-md py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xl font-bold shadow-xl shadow-indigo-500/30 disabled:opacity-60 transition-all"
          >
            {nextLoading ? '...' : 'Next →'}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Normal question view ─────────────────────────────────────────────────────
  // Count-up display: ring fills as elapsed approaches the cap. Last 5 seconds
  // turn red as a soft warning.
  const elapsedPercent = Math.min(100, (elapsed / timerCap) * 100);
  const remaining = Math.max(0, timerCap - elapsed);
  const topScores = Object.entries(scores)
    .map(([uid, s]) => ({ uid, ...s }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col">
      {/* Top bar — count-up timer + score with delta toast */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={remaining <= 5 ? '#ef4444' : '#6366f1'} strokeWidth="3"
                strokeDasharray={`${(elapsedPercent / 100) * 125.6} 125.6`} strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${remaining <= 5 ? 'text-red-400' : 'text-white'}`}>
              {elapsed}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {streak > 1 && <span className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-sm font-semibold">🔥 {t('play.streak')} {streak}</span>}
          <div className="relative px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <span className="text-white font-bold tabular-nums">{score}</span>
            <span className="text-gray-400 text-sm ml-1">{t('play.score')}</span>
            {/* "+N" / "−N" toast that floats up after each answer */}
            <AnimatePresence>
              {lastDelta !== null && lastDelta !== 0 && (
                <motion.span
                  key={`${question.id}-${lastDelta}`}
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: 1, y: -22 }}
                  exit={{ opacity: 0, y: -34 }}
                  className={`absolute right-2 top-2 text-sm font-bold pointer-events-none ${lastDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                >
                  {lastDelta > 0 ? `+${lastDelta}` : lastDelta}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Live leaderboard — top 5 players across the session */}
      {topScores.length > 1 && (
        <div className="px-4 pb-2">
          <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/5 backdrop-blur px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">🏆 Live Leaderboard</span>
              <span className="text-xs text-gray-500">· {Object.keys(scores).length} players</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {topScores.map((s, i) => (
                <div key={s.uid} className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500">#{i + 1}</span>
                  <span className={`font-medium truncate max-w-[120px] ${s.uid === user?.uid ? 'text-indigo-300' : 'text-gray-300'}`}>
                    {s.uid === user?.uid ? 'You' : s.displayName}
                  </span>
                  <span className="text-white font-bold">{s.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {/* Media */}
        {question.media_url && (
          <div className="w-full max-w-lg rounded-2xl overflow-hidden border border-white/10">
            {question.media_type === 'video' ? (
              <video src={question.media_url} controls className="w-full max-h-64 object-contain bg-black" />
            ) : (
              <img src={question.media_url} alt="Question media" className="w-full max-h-64 object-contain bg-black" />
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.h2 key={question.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="text-xl md:text-2xl font-bold text-white text-center max-w-2xl">
            {question.question_text}
          </motion.h2>
        </AnimatePresence>

        {/* Choices */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
          {question.choices.map(choice => (
            <motion.button key={choice.label}
              whileHover={!selected ? { scale: 1.02 } : {}}
              whileTap={!selected ? { scale: 0.98 } : {}}
              disabled={!!selected}
              onClick={() => handleAnswer(choice.label)}
              className={`relative p-4 md:p-6 rounded-2xl bg-gradient-to-br ${CHOICE_COLORS[choice.label as keyof typeof CHOICE_COLORS]} ${!selected ? CHOICE_HOVERS[choice.label as keyof typeof CHOICE_HOVERS] : ''} transition-all duration-200 ${selected === choice.label ? 'ring-2 ring-white/40' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold">{choice.label}</span>
                <span className="text-white font-medium text-left text-sm md:text-base">{choice.choice_text}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
