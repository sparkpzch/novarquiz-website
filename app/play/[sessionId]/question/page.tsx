'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import type { Question } from '@/lib/types';

const CHOICE_COLORS = { A: 'from-red-600 to-red-500', B: 'from-blue-600 to-blue-500', C: 'from-emerald-600 to-emerald-500', D: 'from-amber-600 to-amber-500' };
const CHOICE_HOVERS = { A: 'hover:from-red-500 hover:to-red-400', B: 'hover:from-blue-500 hover:to-blue-400', C: 'hover:from-emerald-500 hover:to-emerald-400', D: 'hover:from-amber-500 hover:to-amber-400' };

export default function QuestionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  const [question, setQuestion] = useState<Question | null>(null);
  const [timerMax, setTimerMax] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [nextLoading, setNextLoading] = useState(false);

  const isSituation = question?.node_type === 'situation';

  const applyQuestion = (q: Question) => {
    setQuestion(q);
    const timer = q.timer_override || 30;
    setTimerMax(timer);
    setTimeLeft(timer);
    setSelected(null);
    setQuestionStartTime(Date.now());
  };

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
  }, [sessionId]);

  useEffect(() => { loadQuestion(); }, [loadQuestion]);

  // Timer — only runs for normal question nodes
  useEffect(() => {
    if (loading || finished || selected || isSituation) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setStreak(0);
          setTimeout(() => setFinished(true), 800);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, finished, selected, isSituation, question?.id]);

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
    const choice = question.choices.find(c => c.label === label);
    const isCorrect = choice?.is_correct || false;

    if (isCorrect) {
      const points = Math.max(100, Math.round(1000 * (timeLeft / timerMax)));
      setScore(prev => prev + points);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }

    try {
      await fetch(`/api/play/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.uid, question_id: question.id, chosen_label: label, is_correct: isCorrect, time_taken_ms: timeTaken }),
      });
    } catch { /* continue */ }

    await new Promise(r => setTimeout(r, 600));
    await goToNext(question.id, label);
  };

  const handleNext = async () => {
    if (!question || nextLoading) return;
    setNextLoading(true);
    await goToNext(question.id, 'continue');
    setNextLoading(false);
  };

  if (finished) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 max-w-sm">
          <span className="text-6xl">🎉</span>
          <h1 className="text-3xl font-bold text-white">{t('play.finished')}</h1>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-4xl font-bold text-white">{score}</p>
            <p className="text-gray-400">{t('play.score')}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push(`/leaderboard?session=${sessionId}`)} className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold">
              {t('play.view_leaderboard')}
            </button>
            <button onClick={() => router.push('/')} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold">Home</button>
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
  const timerPercent = (timeLeft / timerMax) * 100;

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={timeLeft <= 5 ? '#ef4444' : '#6366f1'} strokeWidth="3"
                strokeDasharray={`${(timerPercent / 100) * 125.6} 125.6`} strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>{timeLeft}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {streak > 0 && <span className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-sm font-semibold">🔥 {t('play.streak')} {streak}</span>}
          <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <span className="text-white font-bold">{score}</span>
            <span className="text-gray-400 text-sm ml-1">{t('play.score')}</span>
          </div>
        </div>
      </div>

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
