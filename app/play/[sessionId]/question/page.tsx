'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import type { Choice, LeaderboardEntry, Question, Quiz } from '@/lib/types';
import { updatePlayerMetadata, watchScores, untrackAllUserSessionsFor, type PlayerScore } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { Card } from '@/components/ui/Card';
import QuestionMediaPlayer from '@/components/ui/QuestionMediaPlayer';


const IMPACT_THEME = {
  positive: {
    border: 'border-[#1AC86D]',
    fill: 'bg-[#1AC86D]',
    text: 'text-[#11985A]',
    badge: 'bg-[#E9FFF4] text-[#11985A]',
  },
  negative: {
    border: 'border-[#FF4D4F]',
    fill: 'bg-[#FF4D4F]',
    text: 'text-[#D63A3D]',
    badge: 'bg-[#FFF0F0] text-[#D63A3D]',
  },
  neutral: {
    border: 'border-[#FFB020]',
    fill: 'bg-[#FFB020]',
    text: 'text-[#B57200]',
    badge: 'bg-[#FFF7E9] text-[#B57200]',
  },
} as const;

function getImpactTone(scoreImpact: number) {
  if (scoreImpact > 0) return IMPACT_THEME.positive;
  if (scoreImpact < 0) return IMPACT_THEME.negative;
  return IMPACT_THEME.neutral;
}

function formatImpact(scoreImpact: number) {
  if (scoreImpact > 0) return `+${scoreImpact}`;
  if (scoreImpact < 0) return `${scoreImpact}`;
  return '0';
}

function formatPlayerName(name: string, isMe: boolean) {
  return isMe ? 'You' : name;
}

function QuizHeader({
  elapsed,
  score,
  streak,
  userName,
  photoURL,
  lastDelta,
  totalPlayers,
  topScores,
  currentUserId,
}: {
  elapsed: number;
  score: number;
  streak: number;
  userName?: string | null;
  photoURL?: string | null;
  lastDelta: number | null;
  totalPlayers: number;
  topScores: Array<PlayerScore & { uid: string }>;
  currentUserId?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/75 bg-[linear-gradient(135deg,rgba(150,200,255,.96),rgba(102,164,238,.94))] px-4 py-3 text-[#10284b] shadow-[0_18px_42px_rgba(35,87,145,0.18)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="nq-details text-[#55749c]">Time</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">{elapsed}</p>
        </div>

        <ProfileAvatar
          displayName={userName}
          photoURL={photoURL}
          size={36}
          ringClassName="ring-2 ring-white/80 shadow-md"
        />

        <div className="text-right">
          <p className="nq-details text-[#55749c]">Score</p>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <p className="text-xl font-bold tabular-nums">{score}</p>
            <AnimatePresence>
              {lastDelta !== null && (
                <motion.span
                  key={`delta-${score}-${lastDelta}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={`text-xs font-semibold ${lastDelta >= 0 ? 'text-[#087c4b]' : 'text-[#c33142]'}`}
                >
                  {lastDelta >= 0 ? `+${lastDelta}` : lastDelta}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {(topScores.length > 1 || streak > 1) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#24568f]/15 pt-2.5">
          <span className="nq-details text-[#55749c]">🏆 Live</span>
          <span className="nq-details text-[#55749c]">{totalPlayers} players</span>
          {streak > 1 && <span className="rounded-full bg-[#fff1cd] px-2 py-0.5 text-xs font-semibold text-[#986300]">🔥 {streak}</span>}
          {topScores.map((player, index) => (
            <span key={player.uid} className={`text-xs ${player.uid === currentUserId ? 'font-bold text-[#10284b]' : 'text-[#49688f]'}`}>
              #{index + 1} {formatPlayerName(player.displayName, player.uid === currentUserId)} {player.score}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type VideoQuality = 'auto' | 'hd' | 'sd';
type QuestionWithPoster = Question & {
  poster_url?: string | null;
  thumbnail_url?: string | null;
};
type AnswerFeedback = {
  points_earned: number;
  explanation: string | null;
};

function useVideoQuality(): VideoQuality {
  if (typeof window === 'undefined') return 'auto';
  return (localStorage.getItem('novarquiz-video-quality') as VideoQuality) ?? 'auto';
}

function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|android/i.test(ua);
}

function resolvePreload(quality: VideoQuality): 'auto' | 'metadata' {
  if (quality === 'hd') return 'auto';
  if (quality === 'sd') return 'metadata';
  if (isSafariBrowser()) return 'auto';
  // auto: only preload aggressively when the browser exposes a clearly good network.
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  if (!conn || conn.saveData) return 'metadata';
  const type = conn?.effectiveType ?? '';
  return type === '4g' ? 'auto' : 'metadata';
}

function prepareInlineVideo(src: string, preload: 'auto' | 'metadata') {
  const video = document.createElement('video');
  video.preload = preload;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  // iOS Safari ignores preload and video.load() on detached elements.
  // Attaching to the DOM and calling play() is the only reliable trigger.
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;';
  video.src = src;
  video.dataset.warmSrc = src;
  video.onloadeddata = () => video.pause();
  document.body.appendChild(video);
  video.play().catch(() => {});
  return video;
}

function releaseVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.src = '';
  video.load();
  video.remove();
}

function QuestionVisual({
  question,
  totalQuestions,
  preparedVideo,
}: {
  question: Question;
  totalQuestions?: number;
  preparedVideo?: HTMLVideoElement | null;
}) {
  const [failedMediaQuestionId, setFailedMediaQuestionId] = useState<string | null>(null);
  const quality = useVideoQuality();
  const preload = resolvePreload(quality);
  const mediaError = failedMediaQuestionId === question.id;
  const mediaQuestion = question as QuestionWithPoster;
  const poster = mediaQuestion.poster_url ?? mediaQuestion.thumbnail_url ?? undefined;

  return (
    <>
      {question.media_url && (
        <div className="relative overflow-hidden rounded-[20px] border border-white/10 shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
          {mediaError ? (
            <div className="flex h-52 w-full items-center justify-center bg-[#111d48] md:h-64">
              <p className="nq-details text-[#9AA8D1]">Media unavailable</p>
            </div>
          ) : question.media_type === 'video' ? (
            <QuestionMediaPlayer
              key={question.id}
              src={question.media_url}
              preload={preload}
              poster={poster}
              preparedVideo={preparedVideo}
              onError={() => setFailedMediaQuestionId(question.id)}
            />
          ) : (
            <img
              src={question.media_url}
              alt=""
              className="h-52 w-full object-cover md:h-64"
              onError={() => setFailedMediaQuestionId(question.id)}
            />
          )}
          {!mediaError && (
            <div className="absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-black/40 to-transparent" />
          )}
        </div>
      )}

      <div className={question.media_url ? "mt-4" : ""}>
        <p className="nq-details text-[#9AA8D1]">
          Question {question.question_order + 1}
          {typeof totalQuestions === 'number' && totalQuestions > 0 ? `/${totalQuestions}` : ''}
        </p>
        <h1 className="mt-2 text-lg font-bold leading-snug text-[#F4F7FF] md:text-xl">
          {question.question_text}
        </h1>
      </div>
    </>
  );
}

function ChoiceButton({
  choice,
  disabled,
  onSelect,
}: {
  choice: Choice;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      whileHover={!disabled ? { y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      onClick={onSelect}
      disabled={disabled}
      className="nq-answer-shadow w-full rounded-[18px] border border-white/10 bg-[#111D48]/95 px-5 py-4 text-left transition hover:border-[#7898FF]/65 hover:bg-[#172657] hover:shadow-[0_18px_34px_rgba(0,0,0,0.24)] disabled:cursor-not-allowed"
    >
      <span className="text-base font-semibold text-[#F4F7FF] text-wrap-balance">{choice.choice_text}</span>
    </motion.button>
  );
}

function ResultChoice({
  choice,
  selected,
  feedback,
}: {
  choice: Choice;
  selected: boolean;
  feedback: AnswerFeedback | null;
}) {
  const tone = selected && feedback ? getImpactTone(feedback.points_earned) : IMPACT_THEME.neutral;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[18px] border bg-[#111D48] px-5 py-4 ${selected ? tone.border : 'border-white/10'} ${selected ? 'shadow-[0_18px_36px_rgba(0,0,0,0.28)]' : 'shadow-[0_12px_28px_rgba(0,0,0,0.2)] opacity-75'}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-semibold text-[#F4F7FF] text-wrap-balance">{choice.choice_text}</p>
        {selected && feedback && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${tone.badge}`}>
            {formatImpact(feedback.points_earned)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function FinishedLeaderboard({
  score,
  leaderboard,
  userId,
  router,
  sessionId,
}: {
  score: number;
  leaderboard: LeaderboardEntry[] | null;
  userId?: string;
  router: ReturnType<typeof useRouter>;
  sessionId: string;
}) {
  const [liveScores, setLiveScores] = useState<Record<string, PlayerScore>>({});

  useEffect(() => {
    return watchScores(sessionId, setLiveScores);
  }, [sessionId]);

  const dbUserIds = new Set((leaderboard ?? []).map((e) => e.user_id));
  const mergedEntries: LeaderboardEntry[] = leaderboard === null ? [] : [
    ...leaderboard.map((entry) => {
      const live = liveScores[entry.user_id];
      return live ? { ...entry, total_score: live.score } : entry;
    }),
    ...Object.entries(liveScores)
      // Finished players are already in the DB rows, under an anonymized id.
      .filter(([uid, live]) => !dbUserIds.has(uid) && !live.finished)
      .map(([uid, live]): LeaderboardEntry => ({
        id: uid,
        session_id: sessionId,
        user_id: uid,
        user_display_name: live.displayName,
        user_photo_url: live.photoURL ?? null,
        is_me: uid === userId,
        total_score: live.score,
        correct_count: 0,
        incorrect_count: 0,
        unanswered_count: 0,
        streak: 0,
        total_time_ms: 0,
        completed_at: '',
      })),
  ];

  const board = leaderboard === null ? [] : mergedEntries;
  const sortedBoard = [...board].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (a.total_time_ms !== b.total_time_ms) return a.total_time_ms - b.total_time_ms;
    return (a.user_display_name || '').localeCompare(b.user_display_name || '');
  });
  const myRankIdx = sortedBoard.findIndex((entry) => entry.is_me);
  const myEntry = myRankIdx >= 0 ? sortedBoard[myRankIdx] : null;
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;
  const topThree = sortedBoard.slice(0, 3);
  const podium = [];
  if (topThree.length >= 2) podium.push({ entry: topThree[1], rank: 2, height: 'h-28', featured: false });
  if (topThree.length >= 1) podium.push({ entry: topThree[0], rank: 1, height: 'h-36', featured: true });
  if (topThree.length >= 3) podium.push({ entry: topThree[2], rank: 3, height: 'h-24', featured: false });

  return (
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="nq-card w-full max-w-3xl rounded-[36px] p-6 md:p-8"
        >
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">Leaderboard</p>
            <h1 className="mt-2 text-3xl font-bold text-[#16324F]">Quiz complete</h1>
            <p className="mt-3 text-[#5D7EA1]">Final score: <span className="font-bold text-[#0460A9]">{score}</span></p>
          </div>

          {leaderboard === null ? (
            <div className="mt-8 flex flex-col items-center gap-4 py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
              <p className="text-sm font-medium text-[#5D7EA1]">Loading leaderboard…</p>
            </div>
          ) : (
            <>
              {podium.length > 0 && (
                <div className="mt-8 flex items-end justify-center gap-4">
                  {podium.map(({ entry, rank, height, featured }) => {
                    return (
                      <div key={entry.user_id} className="flex w-24 flex-col items-center">
                        <ProfileAvatar
                          displayName={entry.user_display_name}
                          photoURL={entry.user_photo_url}
                          size={featured ? 72 : 60}
                          ringClassName="ring-4 ring-[#DDF0FF] shadow-[0_16px_28px_rgba(17,87,145,0.14)]"
                        />
                        <div className="mt-3 w-full text-center">
                          <p className="truncate text-sm font-bold text-[#16324F]">{entry.user_display_name}</p>
                          <p className="text-xs text-[#0460A9]">{entry.total_score} pts</p>
                        </div>
                        <div className={`mt-4 flex w-24 items-start justify-center rounded-t-[26px] bg-gradient-to-b from-[#DDF0FF] to-[#8EC0FF] pt-3 text-2xl font-bold text-[#16324F] ${height}`}>
                          {rank}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 rounded-[28px] bg-[#EEF6E4]/80 p-4 md:p-5">
                <div className="space-y-3">
                  {sortedBoard.slice(3, 10).map((entry, index) => {
                    const rank = index + 4;
                    const isMe = !!entry.is_me;
                    return (
                      <div
                        key={entry.user_id}
                        className={`flex items-center gap-4 rounded-[22px] px-4 py-3 ${isMe ? 'bg-[#C9F258] text-[#16324F]' : 'bg-white text-[#16324F]'}`}
                      >
                        <span className="w-5 text-center text-lg font-semibold">{rank}</span>
                        <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={38} />
                        <p className="flex-1 truncate text-lg font-semibold">{isMe ? 'You' : entry.user_display_name}</p>
                        <span className="text-lg font-semibold">{entry.total_score} pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {myEntry && myRankIdx >= 10 && (
                <div className="mt-4 rounded-[22px] bg-[#C9F258] px-4 py-3 text-[#16324F]">
                  <div className="flex items-center gap-4">
                    <span className="w-5 text-center text-lg font-semibold">{myRank}</span>
                    <ProfileAvatar displayName={myEntry.user_display_name} photoURL={myEntry.user_photo_url} size={38} />
                    <p className="flex-1 truncate text-lg font-semibold">You</p>
                    <span className="text-lg font-semibold">{myEntry.total_score} pts</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.push(`/history?session=${sessionId}`)}
              className="flex-1 rounded-2xl bg-[#0460A9] px-4 py-3 text-sm font-semibold text-white!"
            >
              Open full leaderboard
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 rounded-2xl border border-[#0460A9]/12 bg-white px-4 py-3 text-sm font-semibold text-[#16324F]"
            >
              Back home
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ExplanationModal({
  selectedChoice,
  feedback,
  nextLoading,
  error,
  onContinue,
  headerProps,
}: {
  selectedChoice: Choice;
  feedback: AnswerFeedback | null;
  nextLoading: boolean;
  error?: string | null;
  onContinue: () => void;
  headerProps: Parameters<typeof QuizHeader>[0];
}) {
  const tone = getImpactTone(feedback?.points_earned ?? 0);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <div className="absolute inset-0 bg-[#09182f]/35 backdrop-blur-md" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="relative max-h-[92dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-[30px] bg-[#fbfdff] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_32px_64px_rgba(7,16,43,0.28)] sm:rounded-[30px] sm:p-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[#c5d3e5] sm:hidden" />
        <QuizHeader {...headerProps} />

        <div className={`flex items-center gap-3 rounded-[16px] border bg-white px-4 py-3 ${tone.border}`}>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${tone.badge}`}>
            {formatImpact(feedback?.points_earned ?? 0)}
          </span>
          <p className="font-semibold text-[#202832]">{selectedChoice.choice_text}</p>
        </div>

        {feedback?.explanation && (
          <>
            <p className="mb-2 text-sm font-medium text-[#7A8EA7]">Explanation</p>
            <div className="rounded-[18px] bg-[#eef4fd] p-4">
              <p className="text-base leading-relaxed text-[#202832]">{feedback.explanation}</p>
            </div>
          </>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{error}</p>}
        <button
          onClick={onContinue}
          disabled={nextLoading}
          className="w-full rounded-[18px] bg-[#2f6fbd] px-4 py-4 text-base font-semibold text-white! shadow-[0_16px_36px_rgba(4,96,169,0.24)] disabled:opacity-60"
        >
          {nextLoading ? 'Loading…' : 'Next Question'}
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function QuestionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  useTranslation();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const videoQuality = useVideoQuality();

  const [question, setQuestion] = useState<Question | null>(null);
  const [preparedVideo, setPreparedVideo] = useState<HTMLVideoElement | null>(null);
  const [sessionMeta, setSessionMeta] = useState<Quiz | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [nextLoading, setNextLoading] = useState(false);
  const [answerSaving, setAnswerSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const completedRef = useRef(false);
  const completionRef = useRef<{ questionId: string; questionToken: string; choiceLabel?: string } | null>(null);
  const scoreRef = useRef(score);
  const userRef = useRef(user);
  const sessionStartRef = useRef<number>(0);
  const explanationTimerRef = useRef<number | null>(null);
  const prefetchedNextRef = useRef<Question | null>(null);
  const prefetchVideoRef = useRef<HTMLVideoElement | null>(null);
  const currentVideoWarmupRef = useRef<HTMLVideoElement | null>(null);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const answeringRef = useRef(false);
  const videoQualityRef = useRef(videoQuality);

  const playRequest = useCallback(async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (user?.isAnonymous) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    return fetch(url, { ...init, headers });
  }, [user]);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSessionMeta)
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    videoQualityRef.current = videoQuality;
  }, [videoQuality]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    return watchScores(sessionId, setScores);
  }, [sessionId, user]);

  useEffect(() => {
    return () => {
      if (explanationTimerRef.current !== null) {
        window.clearTimeout(explanationTimerRef.current);
      }
      prefetchAbortRef.current?.abort();
      releaseVideo(currentVideoWarmupRef.current);
      releaseVideo(prefetchVideoRef.current);
      currentVideoWarmupRef.current = null;
      prefetchVideoRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (userRef.current && !userRef.current.isAnonymous && !completedRef.current) {
        untrackAllUserSessionsFor(userRef.current.uid, sessionId).catch(() => {});
      }
    };
  }, [sessionId]);

  // Guard against an accidental refresh/close mid-quiz: reloading restarts
  // from the entry question. overscroll-behavior stops mobile pull-to-refresh,
  // which never triggers the beforeunload prompt.
  useEffect(() => {
    if (finished) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ''; // Safari and older Chromium still require this
    };
    const root = document.documentElement;
    const previousOverscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      root.style.overscrollBehaviorY = previousOverscroll;
    };
  }, [finished]);

  const isSituation = question?.node_type === 'situation';
  const isEnd = question?.node_type === 'end';
  const selectedChoice = question?.choices.find((choice) => choice.label === selectedLabel) ?? null;

  const applyQuestion = useCallback((nextQuestion: Question) => {
    if (explanationTimerRef.current !== null) {
      window.clearTimeout(explanationTimerRef.current);
      explanationTimerRef.current = null;
    }

    const nextVideoSrc = nextQuestion.media_type === 'video' ? nextQuestion.media_url : null;
    if (!nextVideoSrc || currentVideoWarmupRef.current?.dataset.warmSrc !== nextVideoSrc) {
      releaseVideo(currentVideoWarmupRef.current);
      currentVideoWarmupRef.current = null;
    }
    setPreparedVideo(currentVideoWarmupRef.current);

    setQuestion(nextQuestion);
    setRequestError(null);
    setSelectedLabel(null);
    setAnswerFeedback(null);
    setLastDelta(null);
    setShowExplanationModal(false);
    setQuestionStartTime(typeof performance !== 'undefined' ? performance.now() : 0);

    const activeUser = userRef.current;
    if (activeUser && !activeUser.isAnonymous) {
      const currentLabel = nextQuestion.question_text?.slice(0, 40) || `Q${nextQuestion.question_order + 1}`;
      updatePlayerMetadata(sessionId, activeUser.uid, {
        currentQuestionId: nextQuestion.id,
        currentQuestionLabel: currentLabel,
      }).catch(() => {});
    }

    trackEvent('question_viewed', {
      session_id: sessionId,
      question_id: nextQuestion.id,
      node_type: nextQuestion.node_type,
      question_order: nextQuestion.question_order,
    });
  }, [sessionId]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await playRequest(`/api/play/${sessionId}/answer?entry=true`, { cache: 'no-store' });
        if (!response.ok) {
          if (!cancelled) setRequestError('Could not load the first question. Please try again.');
          return;
        }

        const data = await response.json();
        if (!data?.id) {
          if (!cancelled) setRequestError('Could not load the first question. Please try again.');
          return;
        }

        if (!cancelled) {
          sessionStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
          applyQuestion(data);
        }
      } catch {
        if (!cancelled) setRequestError('Could not load the first question. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyQuestion, authLoading, playRequest, sessionId, user]);

  useEffect(() => {
    if (loading || finished || isSituation || isEnd || sessionStartRef.current === 0) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((performance.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [finished, isEnd, isSituation, loading, question?.id]);

  const goToNext = async (fromQuestionId: string, choiceLabel: string) => {
    try {
      const response = await playRequest(`/api/play/${sessionId}/answer?fromQuestionId=${encodeURIComponent(fromQuestionId)}&choiceLabel=${encodeURIComponent(choiceLabel)}&questionToken=${encodeURIComponent(question?.question_token ?? '')}`, { cache: 'no-store' });
      if (response.status === 204 && question?.question_token) {
        completionRef.current = { questionId: fromQuestionId, questionToken: question.question_token, choiceLabel };
        setFinished(true);
        return;
      }
      if (!response.ok) {
        setRequestError('Could not load the next question. Please try again.');
        return;
      }
      const next = await response.json();
      if (!next?.id) {
        setRequestError('Could not load the next question. Please try again.');
        return;
      }
      applyQuestion(next);
    } catch {
      setRequestError('Could not load the next question. Please try again.');
    }
  };

  const handleAnswer = async (label: string, answeredAt: number) => {
    if (selectedLabel || !question || answeringRef.current) return;
    answeringRef.current = true;
    setAnswerSaving(true);
    setRequestError(null);
    const currentVideo = document.querySelector<HTMLVideoElement>('.nq-question-player video');
    const resumeVideoOnError = !!currentVideo && !currentVideo.paused;
    currentVideo?.pause();

    if (explanationTimerRef.current !== null) {
      window.clearTimeout(explanationTimerRef.current);
    }

    setSelectedLabel(label);
    setShowExplanationModal(false);
    explanationTimerRef.current = window.setTimeout(() => {
      setShowExplanationModal(true);
      explanationTimerRef.current = null;
    }, 2500);

    const timeTaken = Math.max(0, Math.round(answeredAt - questionStartTime));

    let pointsAwarded = 0;
    let acceptedLabel = label;
    try {
      if (!user) throw new Error('Sign in required');
      const response = await playRequest(`/api/play/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          question_id: question.id,
          question_token: question.question_token,
          chosen_label: label,
          time_taken_ms: timeTaken,
          is_guest: user.isAnonymous,
        }),
      });
      if (!response.ok) throw new Error('Answer was not saved');
      const data = await response.json();
      pointsAwarded = (data?.points_earned as number | undefined) ?? 0;
      if (typeof data?.chosen_label === 'string') {
        acceptedLabel = data.chosen_label;
        setSelectedLabel(acceptedLabel);
      }
      setAnswerFeedback({
        points_earned: (data?.points_earned as number | undefined) ?? 0,
        explanation: (data?.explanation as string | null | undefined) ?? null,
      });
    } catch {
      if (resumeVideoOnError) void currentVideo?.play().catch(() => {});
      if (explanationTimerRef.current !== null) window.clearTimeout(explanationTimerRef.current);
      explanationTimerRef.current = null;
      setSelectedLabel(null);
      setShowExplanationModal(false);
      setRequestError('Could not save your answer. Please try again.');
      answeringRef.current = false;
      setAnswerSaving(false);
      return;
    }
    answeringRef.current = false;
    setAnswerSaving(false);

    const nextScore = score + pointsAwarded;
    setScore(nextScore);
    setLastDelta(pointsAwarded);
    setStreak((current) => (pointsAwarded > 0 ? current + 1 : 0));

    trackEvent('choice_selected', {
      session_id: sessionId,
      question_id: question.id,
      choice_label: acceptedLabel,
      points_earned: pointsAwarded,
      time_taken_ms: timeTaken,
    });

    // Score is written server-side by the answer route via Admin SDK.

    // Prefetch next question + its video while user reads the explanation modal.
    prefetchedNextRef.current = null;
    releaseVideo(prefetchVideoRef.current);
    prefetchVideoRef.current = null;
    prefetchPromiseRef.current = (async () => {
      const controller = new AbortController();
      prefetchAbortRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      try {
        const r = await playRequest(`/api/play/${sessionId}/answer?fromQuestionId=${encodeURIComponent(question.id)}&choiceLabel=${encodeURIComponent(acceptedLabel)}&questionToken=${encodeURIComponent(question.question_token ?? '')}`, { cache: 'no-store', signal: controller.signal });
        if (!r.ok || r.status === 204) return;
        const next: Question = await r.json();
        if (!next?.id || controller.signal.aborted) return;
        prefetchedNextRef.current = next;
        if (next.media_type === 'video' && next.media_url) {
          prefetchVideoRef.current = prepareInlineVideo(next.media_url, resolvePreload(videoQualityRef.current));
        }
      } catch { /* non-fatal */ }
      finally {
        window.clearTimeout(timeout);
        if (prefetchAbortRef.current === controller) prefetchAbortRef.current = null;
      }
    })();
  };

  const handleContinue = async () => {
    if (!question || !selectedLabel || nextLoading || answerSaving) return;
    setNextLoading(true);
    if (prefetchPromiseRef.current) await prefetchPromiseRef.current;
    prefetchPromiseRef.current = null;
    const prefetched = prefetchedNextRef.current;
    prefetchedNextRef.current = null;
    const prefetchVideo = prefetchVideoRef.current;
    prefetchVideoRef.current = null;
    if (prefetched) {
      // Hand the prefetched video over instead of aborting its download.
      if (prefetchVideo) {
        releaseVideo(currentVideoWarmupRef.current);
        currentVideoWarmupRef.current = prefetchVideo;
      }
      applyQuestion(prefetched);
      setNextLoading(false);
    } else {
      releaseVideo(prefetchVideo);
      await goToNext(question.id, selectedLabel);
      setNextLoading(false);
    }
  };

  const handleSituationNext = async () => {
    if (!question || nextLoading) return;
    setNextLoading(true);
    await goToNext(question.id, 'continue');
    setNextLoading(false);
  };

  useEffect(() => {
    if (!finished || !user || completedRef.current) return;
    completedRef.current = true;

    void (async () => {
      let finalScore = score;
      try {
        const response = await fetch(`/api/play/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.uid,
            user_display_name: user.displayName,
            user_photo_url: user.photoURL,
            is_guest: user.isAnonymous,
            final_question_id: completionRef.current?.questionId,
            final_question_token: completionRef.current?.questionToken,
            final_choice_label: completionRef.current?.choiceLabel,
          }),
        });
        if (!response.ok) throw new Error('Completion was not saved');
        const result = await response.json();
        if (typeof result?.total_score === 'number') {
          finalScore = result.total_score;
          setScore(finalScore);
        }
      } catch {
        completedRef.current = false;
        setFinished(false);
        setRequestError('Could not finish the quiz. Please try again.');
        return;
      }

      if (!user.isAnonymous) {
        updatePlayerMetadata(sessionId, user.uid, {
          finished: true,
          currentQuestionId: null,
        }).catch(() => {});
        untrackAllUserSessionsFor(user.uid, sessionId).catch(() => {});
      }

      trackEvent('session_completed', { session_id: sessionId, final_score: finalScore });

      try {
        const response = await playRequest(`/api/play/${sessionId}/leaderboard`, { cache: 'no-store' });
        setLeaderboard(response.ok ? await response.json() : []);
      } catch {
        setLeaderboard([]);
      }
    })();
  }, [finished, playRequest, score, sessionId, user]);

  if (finished) {
    return (
      <FinishedLeaderboard
        score={score}
        leaderboard={leaderboard}
        userId={user?.uid}
        router={router}
        sessionId={sessionId}
      />
    );
  }

  if (loading || !question) {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center">
          {!authLoading && !user ? (
            <div className="text-center">
              <p role="alert">Sign in or join through an invitation to play.</p>
              <button className="mt-4 rounded-xl bg-[#0460A9] px-5 py-3 text-white" onClick={() => router.push('/sign-in')}>Sign in</button>
            </div>
          ) : requestError && !loading ? (
            <div className="text-center">
              <p role="alert">{requestError}</p>
              <button className="mt-4 rounded-xl bg-[#0460A9] px-5 py-3 text-white" onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />}
        </div>
      </div>
    );
  }

  if (isEnd) {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-3xl">
            <QuestionVisual question={question} totalQuestions={sessionMeta?.question_count} preparedVideo={preparedVideo} />
            {requestError && <p role="alert" className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{requestError}</p>}
            {question.question_text && (
              <p className="mt-5 nq-subject leading-relaxed text-[#475E79] dark:text-[#94a9c5]">{question.question_text}</p>
            )}
            <button
              onClick={() => {
                if (!question.question_token) return;
                completionRef.current = { questionId: question.id, questionToken: question.question_token };
                setFinished(true);
              }}
              className="mt-6 w-full rounded-3xl bg-[#0460A9] px-4 py-4 text-base font-semibold text-white! shadow-[0_20px_42px_rgba(17,87,145,0.24)]"
            >
              Finish
            </button>
          </Card>
        </div>
      </div>
    );
  }

  if (isSituation) {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-4 px-4 py-5">
          <QuizHeader
            elapsed={elapsed}
            score={score}
            streak={streak}
            userName={user?.displayName}
            photoURL={user?.photoURL}
            lastDelta={lastDelta}
            totalPlayers={Object.keys(scores).length}
            topScores={Object.entries(scores).map(([uid, value]) => ({ uid, ...value })).sort((a, b) => b.score - a.score).slice(0, 5)}
            currentUserId={user?.uid}
          />

          <Card>
            <QuestionVisual question={question} totalQuestions={sessionMeta?.question_count} preparedVideo={preparedVideo} />
            {requestError && <p role="alert" className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{requestError}</p>}
            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl nq-subject text-[#5D7EA1] dark:text-[#94a9c5]">
                {question.question_text || 'Continue when you are ready for the next part of the quiz.'}
              </p>
              <button
                onClick={handleSituationNext}
                disabled={nextLoading}
                className="rounded-[22px] bg-[#0460A9] px-6 py-3 text-sm font-semibold text-white! disabled:opacity-60"
              >
                {nextLoading ? 'Loading…' : 'Continue'}
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const topScores = Object.entries(scores)
    .map(([uid, value]) => ({ uid, ...value }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="nq-play-screen min-h-screen">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-5">
        {!selectedLabel && (
          <QuizHeader
            elapsed={elapsed}
            score={score}
            streak={streak}
            userName={user?.displayName}
            photoURL={user?.photoURL}
            lastDelta={lastDelta}
            totalPlayers={Object.keys(scores).length}
            topScores={topScores}
            currentUserId={user?.uid}
          />
        )}

        <Card className="nq-play-card relative overflow-hidden rounded-[28px] border-white/10! bg-[#0D173E]/88! p-4! shadow-[0_24px_54px_rgba(0,0,0,0.3)] backdrop-blur-md sm:p-5!">
          <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
            <AnimatePresence>
              {selectedLabel && (
                <motion.div
                  key={`countdown-${question.id}`}
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 2.5, ease: 'linear' }}
                  className="h-full origin-left bg-[#0460A9]"
                />
              )}
            </AnimatePresence>
          </div>

          <QuestionVisual question={question} totalQuestions={sessionMeta?.question_count} preparedVideo={preparedVideo} />

          {requestError && <p role="alert" className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{requestError}</p>}

          <AnimatePresence mode="wait">
            {!selectedLabel && (
              <motion.div
                key={`question-${question.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-5 space-y-3 sm:mt-6"
              >
                {question.choices.map((choice) => (
                  <ChoiceButton
                    key={choice.label}
                    choice={choice}
                    disabled={!!selectedLabel}
                    onSelect={() => handleAnswer(choice.label, performance.now())}
                  />
                ))}
              </motion.div>
            )}

            {!!selectedLabel && (
              <motion.div
                key={`answer-${question.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-5 space-y-3 sm:mt-6"
              >
                {question.choices.map((choice) => (
                  <ResultChoice
                    key={choice.label}
                    choice={choice}
                    selected={choice.label === selectedLabel}
                    feedback={choice.label === selectedLabel ? answerFeedback : null}
                  />
                ))}
              </motion.div>
            )}

          </AnimatePresence>
        </Card>
      </div>

      <AnimatePresence>
        {selectedChoice && showExplanationModal && (
          <ExplanationModal
            key="explanation-modal"
            selectedChoice={selectedChoice}
            feedback={answerFeedback}
            nextLoading={nextLoading || answerSaving}
            error={requestError}
            onContinue={handleContinue}
            headerProps={{
              elapsed,
              score,
              streak,
              userName: user?.displayName,
              photoURL: user?.photoURL,
              lastDelta,
              totalPlayers: Object.keys(scores).length,
              topScores,
              currentUserId: user?.uid,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
