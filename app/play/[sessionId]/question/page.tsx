'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import type { LeaderboardEntry, Question, Quiz } from '@/lib/types';
import { updatePlayerMetadata, watchScores, untrackAllUserSessionsFor, type PlayerScore } from '@/lib/firebase/rtdb';
import { trackEvent } from '@/lib/firebase/analytics';
import QuizHeader from '@/components/play/QuizHeader';
import FinishedQuiz from '@/components/play/FinishedQuiz';
import { QuizChoices, AnswerFeedbackDialog, type AnswerFeedback } from '@/components/play/QuizChoices';
import styles from '@/components/play/quiz.module.css';
import QuestionMediaPlayer from '@/components/ui/QuestionMediaPlayer';


type VideoQuality = 'auto' | 'hd' | 'sd';
type QuestionWithPoster = Question & {
  poster_url?: string | null;
  thumbnail_url?: string | null;
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
  if (typeof navigator === 'undefined') return 'metadata';
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

function QuestionVisual({ question, totalQuestions, preparedVideo, th }: {
  question: Question; totalQuestions?: number; preparedVideo?: HTMLVideoElement | null; th: boolean;
}) {
  const [failedMediaQuestionId, setFailedMediaQuestionId] = useState<string | null>(null);
  const quality = useVideoQuality();
  const mediaError = failedMediaQuestionId === question.id;
  const mediaQuestion = question as QuestionWithPoster;
  const copy = (en: string, thai: string) => th ? thai : en;
  return <>
    {question.media_url && <div className={styles.media}>
      {mediaError ? <div className={styles.mediaError}>{copy('Media unavailable', 'ไม่สามารถโหลดสื่อได้')}</div> : question.media_type === 'video' ?
        <QuestionMediaPlayer key={question.id} src={question.media_url} preload={resolvePreload(quality)} poster={mediaQuestion.poster_url ?? mediaQuestion.thumbnail_url ?? undefined} preparedVideo={preparedVideo} onError={() => setFailedMediaQuestionId(question.id)} /> :
        <img src={question.media_url} alt="" onError={() => setFailedMediaQuestionId(question.id)} />}
    </div>}
    <div className={styles.questionMeta}><span className={styles.eyebrow}>{question.node_type === 'situation' ? copy('SCENARIO', 'สถานการณ์') : question.node_type === 'end' ? copy('FINAL REFLECTION', 'ก่อนดูผลของคุณ') : copy(`QUESTION ${question.question_order + 1}`, `คำถามที่ ${question.question_order + 1}`)}</span>
      {question.node_type === 'normal' && !!totalQuestions && <span className={styles.eyebrow}>{copy(`${totalQuestions} questions`, `ทั้งหมด ${totalQuestions} ข้อ`)}</span>}
    </div>
    <h1 className={styles.questionTitle}>{question.question_text}</h1>
  </>;
}

export default function QuestionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = useCallback((en: string, thai: string) => th ? thai : en, [th]);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const videoQuality = useVideoQuality();

  const [question, setQuestion] = useState<Question | null>(null);
  const [preparedVideo, setPreparedVideo] = useState<HTMLVideoElement | null>(null);
  const [sessionMeta, setSessionMeta] = useState<(Quiz & { quiz_name?: string }) | null>(null);
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
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [completionSaving, setCompletionSaving] = useState(true);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const completedRef = useRef(false);
  const completionRef = useRef<{ questionId: string; questionToken: string; choiceLabel?: string } | null>(null);
  const userRef = useRef(user);
  const sessionStartRef = useRef<number>(0);
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
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    videoQualityRef.current = videoQuality;
  }, [videoQuality]);

  useEffect(() => {
    if (!user || user.isAnonymous || finished) return;
    return watchScores(sessionId, setScores);
  }, [finished, sessionId, user]);

  useEffect(() => {
    return () => {
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
          if (!cancelled) setRequestError(copy('Could not load the first question. Please try again.', 'โหลดคำถามไม่สำเร็จ กรุณาลองอีกครั้ง'));
          return;
        }

        const data = await response.json();
        if (!data?.id) {
          if (!cancelled) setRequestError(copy('Could not load the first question. Please try again.', 'โหลดคำถามไม่สำเร็จ กรุณาลองอีกครั้ง'));
          return;
        }

        if (!cancelled) {
          sessionStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
          applyQuestion(data);
        }
      } catch {
        if (!cancelled) setRequestError(copy('Could not load the first question. Please try again.', 'โหลดคำถามไม่สำเร็จ กรุณาลองอีกครั้ง'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyQuestion, authLoading, copy, playRequest, sessionId, user]);

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
        setRequestError(copy('Could not load the next question. Please try again.', 'โหลดคำถามถัดไปไม่สำเร็จ กรุณาลองอีกครั้ง'));
        return;
      }
      const next = await response.json();
      if (!next?.id) {
        setRequestError(copy('Could not load the next question. Please try again.', 'โหลดคำถามถัดไปไม่สำเร็จ กรุณาลองอีกครั้ง'));
        return;
      }
      applyQuestion(next);
    } catch {
      setRequestError(copy('Could not load the next question. Please try again.', 'โหลดคำถามถัดไปไม่สำเร็จ กรุณาลองอีกครั้ง'));
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

    setSelectedLabel(label);
    setShowExplanationModal(false);

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
      setSelectedLabel(null);
      setShowExplanationModal(false);
      setRequestError(copy('Could not save your answer. Please try again.', 'บันทึกคำตอบไม่สำเร็จ กรุณาเลือกคำตอบอีกครั้ง'));
      answeringRef.current = false;
      setAnswerSaving(false);
      return;
    }
    answeringRef.current = false;
    setAnswerSaving(false);
    setShowExplanationModal(true);

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

  const refreshLeaderboard = useCallback(async () => {
    try {
      const response = await playRequest(`/api/play/${sessionId}/leaderboard`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const entries: LeaderboardEntry[] = await response.json();
      setLeaderboard(entries);
      setLeaderboardError(null);
    } catch {
      setLeaderboardError('Leaderboard unavailable');
    }
  }, [playRequest, sessionId]);

  useEffect(() => {
    if (!finished || completionSaving) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshLeaderboard();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [completionSaving, finished, refreshLeaderboard]);

  useEffect(() => {
    if (!finished || !user || completedRef.current) return;
    completedRef.current = true;
    setCompletionSaving(true);

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
        if (typeof result?.total_time_ms === 'number') setElapsed(Math.floor(result.total_time_ms / 1000));
      } catch {
        completedRef.current = false;
        setFinished(false);
        setRequestError(copy('Could not finish the quiz. Please try again.', 'บันทึกผลแบบทดสอบไม่สำเร็จ กรุณาลองอีกครั้ง'));
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

      setCompletionSaving(false);
      await refreshLeaderboard();
    })();
  }, [copy, finished, refreshLeaderboard, score, sessionId, user]);

  if (finished) {
    return <FinishedQuiz score={score} elapsed={elapsed} quizName={sessionMeta?.quiz_name || sessionMeta?.name} leaderboard={leaderboard} error={leaderboardError} saving={completionSaving} guest={!!user?.isAnonymous} th={th}
      onRetry={() => void refreshLeaderboard()} onHome={() => router.push(user?.isAnonymous ? '/sign-in' : '/')}
      onLeaderboard={() => router.push(`/leaderboard?session=${encodeURIComponent(sessionId)}`)}
      onSummary={() => router.push(user?.isAnonymous ? '/sign-in' : `/stats?session=${encodeURIComponent(sessionId)}`)} />;
  }

  if (loading || !question) {
    return <main className={styles.screen}><div className={`${styles.container} ${styles.centered}`}><section className={styles.surface}>
      {!authLoading && !user ? <div className={styles.empty}><p role="alert">{copy('Sign in or join through an invitation to play.', 'เข้าสู่ระบบหรือเข้าร่วมผ่านคำเชิญเพื่อเริ่มแบบทดสอบ')}</p><div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => router.push('/sign-in')}>{copy('Sign in', 'เข้าสู่ระบบ')}</button></div></div> : requestError && !loading ? <div className={styles.empty}><p className={styles.error} role="alert">{requestError}</p><button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>{copy('Try again', 'ลองอีกครั้ง')}</button></div> : <div className={styles.loading} role="status"><span className={styles.spinner} /><span>{copy('Preparing your question…', 'กำลังเตรียมคำถาม…')}</span></div>}
    </section></div></main>;
  }

  const topScores = Object.entries(scores).map(([uid, value]) => ({ uid, ...value })).sort((a, b) => b.score - a.score).slice(0, 3);
  return <main className={styles.screen}><div className={styles.container}>
    <div className={styles.brandLine}><strong>NOVARQUIZ</strong><span>{sessionMeta?.quiz_name || sessionMeta?.name}</span></div>
    <QuizHeader elapsed={elapsed} score={score} streak={streak} userName={user?.displayName} photoURL={user?.photoURL} lastDelta={lastDelta} totalPlayers={Object.keys(scores).length} topScores={topScores} currentUserId={user?.uid} th={th} />
    <section className={styles.surface}>
      <QuestionVisual question={question} totalQuestions={sessionMeta?.question_count} preparedVideo={preparedVideo} th={th} />
      {requestError && <p role="alert" className={styles.error}>{requestError}</p>}
      {isEnd ? <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => {
        if (!question.question_token) return;
        completionRef.current = { questionId: question.id, questionToken: question.question_token };
        setFinished(true);
      }}>{copy('See my result', 'ดูผลของฉัน')}<span aria-hidden="true">→</span></button></div> : isSituation ? <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={handleSituationNext} disabled={nextLoading}>{nextLoading ? copy('Loading…', 'กำลังโหลด…') : copy('Start the next part', 'ไปต่อเมื่อพร้อม')}<span aria-hidden="true">→</span></button></div> : <>
        <QuizChoices choices={question.choices} selectedLabel={selectedLabel} feedback={answerFeedback} saving={answerSaving} onSelect={(label) => void handleAnswer(label, performance.now())} th={th} />
        {selectedChoice && answerFeedback && <div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={nextLoading} onClick={() => setShowExplanationModal(true)}>{copy('View explanation', 'ดูคำอธิบาย')}</button><button type="button" className={styles.primaryButton} disabled={nextLoading || answerSaving} onClick={handleContinue}>{nextLoading ? copy('Loading…', 'กำลังโหลด…') : copy('Continue', 'ไปต่อ')}<span aria-hidden="true">→</span></button></div>}
      </>}
    </section>
  </div>
    {selectedChoice && answerFeedback && <AnswerFeedbackDialog choice={selectedChoice} feedback={answerFeedback} nextLoading={nextLoading || answerSaving} error={requestError} open={showExplanationModal} onClose={() => setShowExplanationModal(false)} onContinue={handleContinue} th={th} />}
  </main>;
}
