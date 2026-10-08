'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { usePersonalRecapReport } from '@/lib/hooks/usePersonalRecapReport';
import { useAuth } from '@/lib/hooks/useAuth';
import IconRefreshButton from '@/components/ui/IconRefreshButton';
import LucideIcon from '@/components/ui/icons/LucideIcon';
import PersonalRecapCard from '@/components/stats/PersonalRecapCard';
import { historyCoaching, isEverydayInsight, learningTopic, type LearningArea } from '@/lib/analytics/history-coaching';
import type { PersonalHistoryReport, UserHistoryRow } from '@/lib/analytics/history';
import styles from './stats.module.css';

type IconName = 'arrow' | 'book' | 'check';
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    book: <><path d="M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V5ZM12 7v15M6 9h3M15 9h3M6 13h3M15 13h3" /></>,
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
  const coaching = report ? historyCoaching(report, locale) : null;
  const feedback = report?.feedback;
  const everydayFeedback = feedback && feedback.reviewStatus !== 'metrics' && (feedback.reviewStatus !== 'provisional' || isEverydayInsight(feedback)) ? feedback : null;
  const openQuestion = (id: string) => setFocus((previous) => ({ key: reportKey, id, version: (previous?.version ?? 0) + 1 }));

  return (
    <div className={styles.page}>
      <div className="history-wrap">
        <header className="history-heading">
          <h1 className="sr-only">{copy('Your quiz stats', 'สถิติแบบทดสอบของคุณ')}</h1>
          {rows.length > 0 && <div className="history-picker-controls">
            <label htmlFor="history-quiz" className="sr-only">{copy('Your completed quizzes', 'แบบทดสอบที่คุณทำแล้ว')}</label>
            <div className="history-select-field"><select id="history-quiz" value={selectedId ?? ''} onChange={(event) => router.push(`/stats?session=${encodeURIComponent(event.target.value)}`, { scroll: false })}>
              {!selected && <option value={selectedId ?? ''}>{copy('Choose a quiz', 'เลือกแบบทดสอบ')}</option>}
              {rows.map((row) => <option key={row.session_id} value={row.session_id}>{row.session_name} · {date(row.completed_at)}</option>)}
            </select><LucideIcon name="chevron-down" className="history-select-chevron" /></div>
            <IconRefreshButton onRefresh={() => setVersion((v) => v + 1)} label={copy('Refresh your recap', 'โหลดสรุปของคุณอีกครั้ง')} />
          </div>}
          <Link href="/history" className="history-secondary">{copy('View quiz history', 'ดูประวัติแบบทดสอบ')}<Icon name="arrow" /></Link>
        </header>

        {authLoading || (uid && !history) ? <Loading label={copy('Finding your completed quizzes…', 'กำลังค้นหาแบบทดสอบที่คุณทำเสร็จ…')} /> : !uid ? (
          <section className="history-card history-empty"><Icon name="book" /><h2>{copy('Sign in to see your results', 'เข้าสู่ระบบเพื่อดูผลแบบทดสอบ')}</h2><p>{copy('Sign in to see your completed quizzes and helpful next steps.', 'เข้าสู่ระบบเพื่อดูแบบทดสอบที่คุณทำแล้วและคำแนะนำสำหรับคุณ')}</p><Link href="/sign-in?next=%2Fstats" className="history-primary">{copy('Sign in', 'เข้าสู่ระบบ')}</Link></section>
        ) : history?.error ? <ErrorPanel onRetry={() => setVersion((v) => v + 1)} message={copy('We couldn’t find your quizzes. Please try again.', 'ยังโหลดแบบทดสอบของคุณไม่ได้ กรุณาลองอีกครั้ง')} label={copy('Try again', 'ลองอีกครั้ง')} /> : !rows.length ? (
          <section className="history-card history-empty"><Icon name="book" /><h2>{copy('Start with something you’re curious about', 'เริ่มจากเรื่องที่คุณอยากรู้')}</h2><p>{copy('Complete a health quiz, then come back for a simple recap and a next step just for you.', 'ทำแบบทดสอบสุขภาพ แล้วกลับมาดูสรุปและคำแนะนำสำหรับคุณ')}</p><Link href="/quizzes" className="history-primary">{copy('Choose a quiz', 'เลือกแบบทดสอบสุขภาพ')} <Icon name="arrow" /></Link></section>
        ) : <>
          {!selected ? <section className="history-card history-empty"><h2>{copy('Choose one of your completed quizzes', 'เลือกแบบทดสอบที่คุณทำเสร็จแล้ว')}</h2><p>{copy('This quiz isn’t in your history.', 'ไม่พบแบบทดสอบนี้ในประวัติของคุณ')}</p><Link href="/stats" className="history-primary">{copy('See my latest quiz', 'ดูแบบทดสอบล่าสุด')}</Link></section> : !reportResult ? <Loading label={copy('Loading summary…', 'กำลังเตรียมสรุปผลแบบทดสอบ…')} /> : reportResult.error ? <ErrorPanel onRetry={() => setVersion((v) => v + 1)} message={copy('Your recap couldn’t load. Give it another try.', 'ยังโหลดสรุปของคุณไม่ได้ กรุณาลองอีกครั้ง')} label={copy('Try again', 'ลองอีกครั้ง')} /> : report && coaching && <>
            <div className="history-layout">
              <section className="history-card history-session" aria-labelledby="session-title">
              <div className="history-session-heading"><h2 id="session-title">{report.session.session_name}</h2><p className="history-session-date">{copy('Completed', 'ทำเสร็จเมื่อ')} {date(report.session.completed_at)}</p>{report.session.session_description && <p className="history-session-description">{report.session.session_description}</p>}</div>
              <ScoreSummary correct={report.session.correct_count} incorrect={report.session.incorrect_count} locale={locale} />
              <dl className="history-metrics">
                <div><dt>{copy('Total score', 'คะแนนรวม')}</dt><dd>{report.session.total_score.toLocaleString(locale)}</dd></div>
                <div><dt>{copy('Rank', 'อันดับ')}</dt><dd>{report.session.rank > 0 ? report.session.rank.toLocaleString(locale) : '—'}<small>{copy(`of ${report.session.total_players.toLocaleString(locale)} players`, `จาก ${report.session.total_players.toLocaleString(locale)} คน`)}</small></dd></div>
                <div><dt>{copy('Answer streak', 'ตอบถูกต่อเนื่อง')}</dt><dd>{report.session.streak.toLocaleString(locale)}<small>{copy('questions', 'ข้อ')}</small></dd></div>
                <div><dt>{copy('Time spent', 'เวลาที่ใช้')}</dt><dd>{formatDuration(report.session.total_time_ms, locale)}</dd></div>
              </dl>
            </section>
              <aside className="history-side">
                <PersonalRecapCard report={report} locale={locale} fullDetails />
                {coaching.total > 0 && <section className="history-card history-area-card" aria-labelledby="topics-title">
                  <div className="history-card-heading"><h2 id="topics-title">{copy('Topics', 'ผลรายหัวข้อ')}</h2><span className="history-card-meta">{copy(`${coaching.practice.length} to review`, `ควรทบทวน ${coaching.practice.length}`)}</span></div>
                  {coaching.practice.map((area) => <AreaRow key={area.id} area={area} locale={locale} onOpen={() => openQuestion(area.reviewIds[0])} />)}
                  {coaching.strengths.map((area) => <AreaRow key={area.id} area={area} locale={locale} />)}
                </section>}
              </aside>
              {coaching.total > 0 && <AnswerReview key={reportKey} report={report} locale={locale} focusedId={focus?.key === reportKey ? focus.id : null} focusVersion={focus?.version ?? 0} />}
            </div>
            <footer className="history-footnote"><p>{everydayFeedback?.reviewStatus === 'provisional' ? copy('AI helped write this recap from your quiz answers. It hasn’t been reviewed yet.', 'AI ช่วยเขียนสรุปนี้จากคำตอบของคุณ โดยยังไม่ได้รับการตรวจทาน') : everydayFeedback && everydayFeedback.reviewStatus !== 'standard' ? copy('This recap uses reviewed quiz feedback.', 'สรุปนี้ใช้คำแนะนำจากแบบทดสอบที่ผ่านการตรวจทาน') : copy('This recap is based on your quiz answers.', 'สรุปนี้อ้างอิงจากคำตอบในแบบทดสอบของคุณ')}</p><p>{copy('Quiz results are not a health assessment or medical advice.', 'ผลแบบทดสอบไม่ใช่การประเมินสุขภาพหรือคำแนะนำทางการแพทย์')}</p></footer>
          </>}
        </>}
      </div>
    </div>
  );
}

function AreaRow({ area, locale, onOpen }: { area: LearningArea; locale: 'en' | 'th'; onOpen?: () => void }) {
  const percent = area.total ? Math.round((area.correct / area.total) * 100) : 0;
  const content = <>
    <span className="history-area-words"><strong>{area.title}</strong><span className="history-area-bar" data-review={onOpen ? true : undefined}><span style={{ width: `${percent}%` }} /></span></span>
    <span className="history-area-score">{area.correct}/{area.total}</span>
    {onOpen && <Icon name="arrow" className="history-area-arrow" />}
    <span className="sr-only">{locale === 'th' ? `ตอบถูก ${area.correct} จาก ${area.total} ข้อ` : `${area.correct} of ${area.total} correct`}</span>
  </>;
  return onOpen ? <button type="button" className="history-area-row history-area-link" onClick={onOpen}>{content}</button> : <div className="history-area-row">{content}</div>;
}

function AnswerReview({ report, locale, focusedId, focusVersion }: { report: PersonalHistoryReport; locale: 'en' | 'th'; focusedId: string | null; focusVersion: number }) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const [filter, setFilter] = useState<'all' | 'review' | 'correct'>(() => report.answers.some((answer) => !answer.selectedAligned) ? 'review' : 'all');
  const answerRefs = useRef(new Map<string, HTMLDetailsElement>());
  useEffect(() => {
    if (!focusedId) return;
    const question = answerRefs.current.get(focusedId);
    if (question) {
      question.open = true;
      question.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      question.querySelector('summary')?.focus({ preventScroll: true });
    }
  }, [focusedId, focusVersion]);
  const reviewCount = report.answers.filter((answer) => !answer.selectedAligned).length;
  const tabs = [
    { id: 'all', label: copy('All', 'ทั้งหมด'), count: report.answers.length },
    { id: 'review', label: copy('To review', 'ควรทบทวน'), count: reviewCount },
    { id: 'correct', label: copy('Correct', 'ตอบถูก'), count: report.answers.length - reviewCount },
  ] as const;
  const hidden = (aligned: boolean, id: string) => id !== focusedId && (filter === 'review' ? aligned : filter === 'correct' ? !aligned : false);
  return <section className="history-card history-review-section" aria-labelledby="review-title">
    <div className="history-review-heading"><h2 id="review-title">{copy('Your answers', 'คำตอบของคุณ')}</h2>
      <div className="history-tabs" role="group" aria-label={copy('Filter answers', 'กรองคำตอบ')}>{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
    </div>
    <div className="history-review-content">
      {filter !== 'all' && tabs.find((tab) => tab.id === filter)?.count === 0 && <p className="history-area-empty">{filter === 'review' ? copy('You answered every question correctly.', 'คุณตอบถูกครบทุกข้อ') : copy('No correct answers in this quiz yet.', 'ยังไม่มีข้อที่ตอบถูกในแบบทดสอบนี้')}</p>}
      {report.answers.map((answer, index) => <details key={answer.id} ref={(element) => { if (element) answerRefs.current.set(answer.id, element); else answerRefs.current.delete(answer.id); }} className="history-question" hidden={hidden(answer.selectedAligned, answer.id)}>
        <summary><span className={`history-question-mark ${answer.selectedAligned ? 'history-mark-good' : ''}`}><Icon name={answer.selectedAligned ? 'check' : 'book'} /></span><span><small>{copy(`Question ${index + 1}`, `ข้อ ${index + 1}`)} · {answer.selectedAligned ? copy('Answered correctly', 'ตอบถูก') : copy('Review answer', 'ทบทวนคำตอบ')}</small><strong>{answer.question}</strong><span className="history-question-topic">{answer.tags.map((tag) => learningTopic(tag, locale)?.title ?? tag.replace(/^#/, '').replaceAll('_', ' ')).join(' · ')}</span></span><span className="history-question-chevron" aria-hidden="true">⌄</span></summary>
        <div className="history-answer-detail"><div className="history-your-choice"><p className="history-answer-label">{copy('What you chose', 'คำตอบที่คุณเลือก')}</p><p>{answer.selected}</p>{answer.selectedExplanation && <p className="history-answer-explanation">{answer.selectedExplanation}</p>}</div>
          {answer.alignedChoices.map((choice, choiceIndex) => <div className="history-explained-choice" key={choiceIndex}><p className="history-answer-label">{copy('Answer key', 'เฉลย')}</p><p>{choice.text}</p>{choice.explanation && <p className="history-answer-explanation">{choice.explanation}</p>}</div>)}
          {!answer.selectedExplanation && !answer.alignedChoices.some((choice) => choice.explanation) && <p className="history-answer-explanation">{copy('There isn’t an explanation for this question yet.', 'คำถามนี้ยังไม่มีคำอธิบาย')}</p>}
        </div>
      </details>)}
    </div>
  </section>;
}

function ScoreSummary({ correct, incorrect, locale }: { correct: number; incorrect: number; locale: 'en' | 'th' }) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const total = correct + incorrect;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return <div className="history-score">
    <p className="history-score-main"><strong>{correct.toLocaleString(locale)}</strong><span>{copy(`of ${total.toLocaleString(locale)} correct`, `จาก ${total.toLocaleString(locale)} ข้อที่ตอบถูก`)}</span><em>{percent}%</em></p>
    <div className="history-score-bar" role="img" aria-label={copy(`${correct} correct, ${incorrect} incorrect`, `ตอบถูก ${correct} ข้อ ตอบผิด ${incorrect} ข้อ`)}><span style={{ width: `${percent}%` }} /></div>
    <p className="history-score-legend"><span className="history-legend-good">{copy(`Correct ${correct}`, `ตอบถูก ${correct}`)}</span><span className="history-legend-review">{copy(`Incorrect ${incorrect}`, `ตอบผิด ${incorrect}`)}</span></p>
  </div>;
}

function formatDuration(value: number | null, locale: 'en' | 'th') {
  if (value === null) return '—';
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  return locale === 'th' ? `${minutes} น. ${seconds % 60} วิ.` : `${minutes}m ${seconds % 60}s`;
}

function Loading({ label }: { label: string }) {
  return <div role="status" className="history-card history-loading"><span className="history-spinner" aria-hidden="true" />{label}</div>;
}
function ErrorPanel({ message, label, onRetry }: { message: string; label: string; onRetry: () => void }) {
  return <section role="alert" className="history-card history-empty"><p>{message}</p><button type="button" onClick={onRetry} className="history-primary">{label}</button></section>;
}
export default function StatsPage() {
  return <Suspense fallback={<div className={styles.page}><Loading label="Loading…" /></div>}><StatsPageContent /></Suspense>;
}
