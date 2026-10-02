'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { usePersonalRecapReport } from '@/lib/hooks/usePersonalRecapReport';
import { useAuth } from '@/lib/hooks/useAuth';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import PersonalRecapCard from '@/components/stats/PersonalRecapCard';
import { historyCoaching, isEverydayInsight, learningTopic, type LearningArea } from '@/lib/analytics/history-coaching';
import type { PersonalHistoryReport, UserHistoryRow } from '@/lib/analytics/history';
import './stats.css';

type IconName = LearningArea['icon'] | 'spark' | 'arrow' | 'book' | 'check';
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    plan: <><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4V2h6v2M9 10l1.5 1.5L14 8M9 16h6" /></>,
    checkup: <><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M7 3v4M17 3v4M3 11h18M9 16l2 2 4-4" /></>,
    help: <><path d="m12 3 10 17H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    move: <><circle cx="15" cy="4" r="2" /><path d="m12 8 4 3 4 1M8 12l4-4-1 7 5 3v4M11 15l-5 6M5 9h4" /></>,
    notice: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    food: <><path d="M20 3C11 2 4 5 4 12c0 5 6 8 10 5 5-3 6-9 6-14Z" /><path d="M3 22 15 9" /></>,
    learn: <><path d="M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V5ZM12 7v15" /></>,
    book: <><path d="M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V5ZM12 7v15M6 9h3M15 9h3M6 13h3M15 13h3" /></>,
    spark: <path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function StatsPageContent() {
  const { user, loading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('th') ? 'th' : 'en';
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const router = useRouter();
  const params = useSearchParams();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [version, setVersion] = useState(0);
  const [historyState, setHistoryState] = useState<{ key: string; rows: UserHistoryRow[]; error: boolean } | null>(null);
  const [focus, setFocus] = useState<{ key: string; id: string; version: number } | null>(null);
  const historyKey = `${uid}:${version}`;
  const history = historyState?.key === historyKey ? historyState : null;
  const rows = history?.rows ?? [];
  const selectedId = params.get('session') ?? rows[0]?.session_id ?? null;
  const selected = rows.find((row) => row.session_id === selectedId);
  const reportKey = `${uid}:${selectedId}:${locale}:${version}`;
  const reportResult = usePersonalRecapReport(uid, selected?.session_id ?? null, locale, version);
  const report = reportResult?.data;

  useEffect(() => {
    if (!uid) return;
    const abort = new AbortController();
    fetch(`/api/users/${encodeURIComponent(uid)}/history`, { signal: abort.signal, cache: 'no-store' })
      .then(async (res) => { if (!res.ok) throw new Error('History unavailable'); return res.json() as Promise<UserHistoryRow[]>; })
      .then((data) => setHistoryState({ key: historyKey, rows: data, error: false }))
      .catch(() => { if (!abort.signal.aborted) setHistoryState({ key: historyKey, rows: [], error: true }); });
    return () => abort.abort();
  }, [uid, historyKey]);

  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : copy('Completed quiz', 'แบบทดสอบที่ทำเสร็จแล้ว');
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const coaching = report ? historyCoaching(report, locale) : null;
  const feedback = report?.feedback;
  const everydayFeedback = feedback && feedback.reviewStatus !== 'metrics' && isEverydayInsight(feedback) ? feedback : null;
  const openQuestion = (id: string) => setFocus((previous) => ({ key: reportKey, id, version: (previous?.version ?? 0) + 1 }));

  return (
    <div className="nq-history">
      <div className="history-wrap">
        <div className="history-topbar">
          <Link href="/" className="history-back">← {copy('Home', 'หน้าหลัก')}</Link>
          <div className="history-person"><ProfileAvatar displayName={user?.displayName} photoURL={user?.photoURL} size={32} /><span>{firstName ? copy(`For ${firstName}`, `สำหรับ ${firstName}`) : copy('For you', 'สำหรับคุณ')}</span></div>
        </div>
        <header className="history-heading">
          <p className="history-eyebrow">{copy('A little learning, every day', 'เรียนรู้วันละนิด เข้าใจมากขึ้น')}</p>
          <h1>{copy('Your health knowledge', 'เรียนรู้เรื่องสุขภาพของคุณ')}</h1>
          <p>{copy('See what you learned. Find one small thing to explore next.', 'ดูสิ่งที่คุณเรียนรู้ แล้วเลือกหนึ่งเรื่องมาทำความเข้าใจต่อ')}</p>
        </header>

        {authLoading || (uid && !history) ? <Loading label={copy('Finding your completed quizzes…', 'กำลังค้นหาแบบทดสอบที่คุณทำเสร็จ…')} /> : !uid ? (
          <section className="history-card history-empty"><Icon name="book" /><h2>{copy('Make your learning personal', 'เรียนรู้ในแบบของคุณ')}</h2><p>{copy('Sign in to see your completed quizzes and helpful next steps.', 'เข้าสู่ระบบเพื่อดูแบบทดสอบที่คุณทำแล้วและคำแนะนำสำหรับคุณ')}</p><Link href="/sign-in?next=%2Fstats" className="history-primary">{copy('Sign in', 'เข้าสู่ระบบ')}</Link></section>
        ) : history?.error ? <ErrorPanel onRetry={() => setVersion((v) => v + 1)} message={copy('We couldn’t find your quizzes. Please try again.', 'ยังโหลดแบบทดสอบของคุณไม่ได้ กรุณาลองอีกครั้ง')} label={copy('Try again', 'ลองอีกครั้ง')} /> : !rows.length ? (
          <section className="history-card history-empty"><Icon name="book" /><h2>{copy('Start with something you’re curious about', 'เริ่มจากเรื่องที่คุณอยากรู้')}</h2><p>{copy('Complete a health quiz, then come back for a simple recap and a next step just for you.', 'ทำแบบทดสอบสุขภาพ แล้วกลับมาดูสรุปและคำแนะนำสำหรับคุณ')}</p><Link href="/quizzes" className="history-primary">{copy('Explore health quizzes', 'เลือกแบบทดสอบสุขภาพ')} <Icon name="arrow" /></Link></section>
        ) : <>
          <div className="history-quiz-picker">
            <label htmlFor="history-quiz">{copy('Your completed quizzes', 'แบบทดสอบที่คุณทำแล้ว')}</label>
            <div className="history-picker-controls"><select id="history-quiz" value={selectedId ?? ''} onChange={(event) => router.push(`/stats?session=${encodeURIComponent(event.target.value)}`, { scroll: false })}>
              {!selected && <option value={selectedId ?? ''}>{copy('Choose a quiz', 'เลือกแบบทดสอบ')}</option>}
              {rows.map((row) => <option key={row.session_id} value={row.session_id}>{row.session_name} · {date(row.completed_at)}</option>)}
            </select><button type="button" className="history-refresh" onClick={() => setVersion((v) => v + 1)} aria-label={copy('Refresh your recap', 'โหลดสรุปของคุณอีกครั้ง')} title={copy('Refresh your recap', 'โหลดสรุปของคุณอีกครั้ง')}>↻</button></div>
          </div>
          {!selected ? <section className="history-card history-empty"><h2>{copy('Choose one of your completed quizzes', 'เลือกแบบทดสอบที่คุณทำเสร็จแล้ว')}</h2><p>{copy('This quiz isn’t in your history.', 'ไม่พบแบบทดสอบนี้ในประวัติของคุณ')}</p><Link href="/stats" className="history-primary">{copy('See my latest quiz', 'ดูแบบทดสอบล่าสุด')}</Link></section> : !reportResult ? <Loading label={copy('Putting your personal recap together…', 'กำลังเตรียมสรุปสำหรับคุณ…')} /> : reportResult.error ? <ErrorPanel onRetry={() => setVersion((v) => v + 1)} message={copy('Your recap couldn’t load. Give it another try.', 'ยังโหลดสรุปของคุณไม่ได้ กรุณาลองอีกครั้ง')} label={copy('Try again', 'ลองอีกครั้ง')} /> : report && coaching && <>
            <PersonalRecapCard report={report} locale={locale} />

            {coaching.total > 0 && <>
              <section className="history-card history-next-step" aria-labelledby="next-step-title">
                <div className="history-next-icon"><Icon name={coaching.nextArea?.icon ?? 'learn'} /></div>
                <div className="history-next-content"><p className="history-section-label">{copy('One small next step', 'เริ่มจากเรื่องเล็ก ๆ หนึ่งเรื่อง')}</p>
                  <h2 id="next-step-title">{coaching.nextArea?.title ?? copy('Take a closer look at one question', 'ลองทำความเข้าใจหนึ่งคำถาม')}</h2>
                  <p>{coaching.review.length ? copy(`You have ${coaching.nextArea?.reviewIds.length ?? 1} ${(coaching.nextArea?.reviewIds.length ?? 1) === 1 ? 'question' : 'questions'} to revisit on this topic. Let’s walk through one together.`, `คุณมี ${coaching.nextArea?.reviewIds.length ?? 1} ข้อในเรื่องนี้ที่ควรทบทวน มาค่อย ๆ ทำความเข้าใจหนึ่งข้อไปด้วยกัน`) : copy('You answered these questions correctly. Take another look at one explanation to keep the idea fresh.', 'คุณตอบคำถามเหล่านี้ได้ถูกต้อง ลองอ่านเหตุผลของคำตอบอีกครั้งเพื่อทบทวนสิ่งที่เรียนรู้')}</p>
                </div>
                {coaching.nextAnswer && <button type="button" className="history-primary" onClick={() => openQuestion(coaching.nextAnswer!.id)}>{copy('Help me understand', 'ช่วยอธิบายให้เข้าใจ')}<Icon name="arrow" /></button>}
              </section>

              <div className="history-learning-grid">
                <section className="history-card history-area-card" aria-labelledby="strengths-title"><div className="history-card-heading"><span className="history-tone-icon history-tone-green"><Icon name="check" /></span><h2 id="strengths-title">{copy('You did well with', 'เรื่องที่คุณทำได้ดี')}</h2></div>
                  <p className="history-card-intro">{copy('Ideas you answered well in this quiz.', 'เรื่องที่คุณตอบได้ดีในแบบทดสอบนี้')}</p>
                  {coaching.strengths.length ? coaching.strengths.map((area) => <AreaRow key={area.id} area={area} locale={locale} />) : <p className="history-area-empty">{coaching.correct ? copy(`${coaching.correct} ${coaching.correct === 1 ? 'answer gives' : 'answers give'} you a starting point. Let’s build on that, one question at a time.`, `คุณมี ${coaching.correct} คำตอบเป็นจุดเริ่มต้น มาค่อย ๆ เรียนรู้ไปทีละข้อ`) : copy('Every question is a chance to learn. Pick one idea to explore first.', 'ทุกคำถามเป็นโอกาสให้เรียนรู้ เลือกหนึ่งเรื่องมาทำความเข้าใจก่อน')}</p>}
                </section>
                <section className="history-card history-area-card" aria-labelledby="practice-title"><div className="history-card-heading"><span className="history-tone-icon history-tone-peach"><Icon name="book" /></span><h2 id="practice-title">{copy('Worth another look', 'เรื่องที่น่าลองทบทวน')}</h2></div>
                  <p className="history-card-intro">{copy('A few ideas to make clearer, at your own pace.', 'ค่อย ๆ ทำความเข้าใจเรื่องเหล่านี้ในจังหวะของคุณ')}</p>
                  {coaching.practice.length ? coaching.practice.map((area) => <AreaRow key={area.id} area={area} locale={locale} onOpen={() => openQuestion(area.reviewIds[0])} />) : <p className="history-area-empty">{copy('Nothing to revisit in this quiz. You can still read the explanations below.', 'แบบทดสอบนี้ไม่มีข้อที่ต้องทบทวนเพิ่มเติม คุณยังอ่านคำอธิบายด้านล่างได้')}</p>}
                </section>
              </div>
              <AnswerReview key={reportKey} report={report} locale={locale} focusedId={focus?.key === reportKey ? focus.id : null} focusVersion={focus?.version ?? 0} />
            </>}
            <footer className="history-footnote"><p>{everydayFeedback?.reviewStatus === 'provisional' ? copy('AI helped write this recap from your quiz answers. It hasn’t been reviewed yet.', 'AI ช่วยเขียนสรุปนี้จากคำตอบของคุณ โดยยังไม่ได้รับการตรวจทาน') : everydayFeedback ? copy('This recap uses reviewed quiz feedback.', 'สรุปนี้ใช้คำแนะนำจากแบบทดสอบที่ผ่านการตรวจทาน') : copy('This recap is based on your quiz answers.', 'สรุปนี้อ้างอิงจากคำตอบในแบบทดสอบของคุณ')}</p><p>{copy('It describes your learning, not your health. It isn’t medical advice.', 'สรุปนี้บอกสิ่งที่คุณเรียนรู้ ไม่ใช่ผลตรวจสุขภาพหรือคำแนะนำทางการแพทย์')}</p></footer>
          </>}
        </>}
      </div>
    </div>
  );
}

function AreaRow({ area, locale, onOpen }: { area: LearningArea; locale: 'en' | 'th'; onOpen?: () => void }) {
  const content = <><span className="history-area-icon"><Icon name={area.icon} /></span><span className="history-area-words"><strong>{area.title}</strong><span>{onOpen ? (locale === 'th' ? `${area.reviewIds.length} ข้อให้ลองทบทวน` : `${area.reviewIds.length} ${area.reviewIds.length === 1 ? 'question' : 'questions'} to revisit`) : (locale === 'th' ? `ตอบถูก ${area.correct} จาก ${area.total} ข้อ` : `${area.correct} of ${area.total} questions answered correctly`)}</span></span>{onOpen && <Icon name="arrow" className="history-area-arrow" />}</>;
  return onOpen ? <button type="button" className="history-area-row history-area-link" onClick={onOpen}>{content}</button> : <div className="history-area-row">{content}</div>;
}

function AnswerReview({ report, locale, focusedId, focusVersion }: { report: PersonalHistoryReport; locale: 'en' | 'th'; focusedId: string | null; focusVersion: number }) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const [onlyReview, setOnlyReview] = useState(false);
  const sectionRef = useRef<HTMLDetailsElement>(null);
  const answerRefs = useRef(new Map<string, HTMLDetailsElement>());
  useEffect(() => {
    if (!focusedId) return;
    const question = answerRefs.current.get(focusedId);
    if (sectionRef.current && question) {
      sectionRef.current.open = true;
      question.open = true;
      question.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      question.querySelector('summary')?.focus({ preventScroll: true });
    }
  }, [focusedId, focusVersion]);
  return <details ref={sectionRef} className="history-card history-review-section">
    <summary className="history-review-heading"><div><h2>{copy('Understand your answers', 'ทำความเข้าใจคำตอบของคุณ')}</h2><p>{copy('A closer look, whenever you’re ready.', 'ดูรายละเอียดเมื่อคุณพร้อม')}</p></div><span className="history-review-plus" aria-hidden="true">+</span></summary>
    <div className="history-review-content">{report.answers.some((answer) => !answer.selectedAligned) && <label className="history-review-filter"><input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} />{copy('Only questions to revisit', 'เฉพาะข้อที่ควรทบทวน')}</label>}
      {onlyReview && report.answers.every((answer) => answer.selectedAligned) && <p>{copy('You answered every question correctly.', 'คุณตอบถูกครบทุกข้อ')}</p>}
      {report.answers.map((answer, index) => <details key={answer.id} ref={(element) => { if (element) answerRefs.current.set(answer.id, element); else answerRefs.current.delete(answer.id); }} className="history-question" hidden={onlyReview && answer.selectedAligned && answer.id !== focusedId}>
        <summary><span className={`history-question-mark ${answer.selectedAligned ? 'history-mark-good' : ''}`}><Icon name={answer.selectedAligned ? 'check' : 'book'} /></span><span><small>{copy(`Question ${index + 1}`, `ข้อ ${index + 1}`)} · {answer.selectedAligned ? copy('Answered correctly', 'ตอบถูก') : copy('Let’s revisit', 'มาทบทวนกัน')}</small><strong>{answer.tags.map((tag) => learningTopic(tag, locale)).find(Boolean)?.title ?? copy('A question from your quiz', 'คำถามจากแบบทดสอบของคุณ')}</strong></span><span className="history-question-chevron" aria-hidden="true">⌄</span></summary>
        <div className="history-answer-detail"><h3>{answer.question}</h3><div className="history-your-choice"><p className="history-answer-label">{copy('What you chose', 'คำตอบที่คุณเลือก')}</p><p>{answer.selected}</p>{answer.selectedExplanation && <p className="history-answer-explanation">{answer.selectedExplanation}</p>}</div>
          {answer.alignedChoices.map((choice, choiceIndex) => <div className="history-explained-choice" key={choiceIndex}><p className="history-answer-label">{copy('What the quiz explains', 'สิ่งที่แบบทดสอบอธิบาย')}</p><p>{choice.text}</p>{choice.explanation && <p className="history-answer-explanation">{choice.explanation}</p>}</div>)}
          {!answer.selectedExplanation && !answer.alignedChoices.some((choice) => choice.explanation) && <p className="history-answer-explanation">{copy('There isn’t an explanation for this question yet.', 'คำถามนี้ยังไม่มีคำอธิบาย')}</p>}
        </div>
      </details>)}
    </div>
  </details>;
}

function Loading({ label }: { label: string }) {
  return <div role="status" className="history-card history-loading"><span className="history-spinner" aria-hidden="true" />{label}</div>;
}
function ErrorPanel({ message, label, onRetry }: { message: string; label: string; onRetry: () => void }) {
  return <section role="alert" className="history-card history-empty"><p>{message}</p><button type="button" onClick={onRetry} className="history-primary">{label}</button></section>;
}
export default function StatsPage() {
  return <Suspense fallback={<div className="history-loading" />}><StatsPageContent /></Suspense>;
}
