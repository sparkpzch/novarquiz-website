'use client';

import { Fragment, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useAuth } from '@/lib/hooks/useAuth';
import IconRefreshButton from '@/components/ui/IconRefreshButton';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import TopicScoreHistogram from '@/components/stats/TopicScoreHistogram';
import { learningTopic, personalLearningAreas } from '@/lib/analytics/history-coaching';
import type { HistoryAnswer, PersonalHistoryReport, UserHistoryRow } from '@/lib/analytics/history';
import './history.css';

function HistoryContent() {
  const { user, loading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('th') ? 'th' : 'en';
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const router = useRouter();
  const params = useSearchParams();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [version, setVersion] = useState(0);
  const [quizSearch, setQuizSearch] = useState('');
  const [historyState, setHistoryState] = useState<{ key: string; rows: UserHistoryRow[]; error: boolean } | null>(null);
  const [reportState, setReportState] = useState<{ key: string; data: PersonalHistoryReport | null; error: boolean } | null>(null);
  const historyKey = `${uid}:${version}`;
  const history = historyState?.key === historyKey ? historyState : null;
  const rows = history?.rows ?? [];
  const selectedId = params.get('session') ?? rows[0]?.session_id ?? null;
  const selected = rows.find((row) => row.session_id === selectedId);
  const reportKey = `${uid}:${selectedId}:${locale}:${version}`;
  const result = reportState?.key === reportKey ? reportState : null;
  const report = result?.data;

  useEffect(() => {
    if (!uid) return;
    const abort = new AbortController();
    fetch(`/api/users/${encodeURIComponent(uid)}/history`, { signal: abort.signal })
      .then(async (response) => { if (!response.ok) throw new Error('History unavailable'); return response.json() as Promise<UserHistoryRow[]>; })
      .then((data) => setHistoryState({ key: historyKey, rows: data, error: false }))
      .catch(() => { if (!abort.signal.aborted) setHistoryState({ key: historyKey, rows: [], error: true }); });
    return () => abort.abort();
  }, [uid, historyKey]);

  useEffect(() => {
    if (!uid || !selected) return;
    const abort = new AbortController();
    fetch(`/api/users/${encodeURIComponent(uid)}/history?session=${encodeURIComponent(selected.session_id)}&locale=${locale}&summary=none`, { signal: abort.signal })
      .then(async (response) => { if (!response.ok) throw new Error('Report unavailable'); return response.json() as Promise<PersonalHistoryReport>; })
      .then((data) => setReportState({ key: reportKey, data, error: false }))
      .catch(() => { if (!abort.signal.aborted) setReportState({ key: reportKey, data: null, error: true }); });
    return () => abort.abort();
  }, [uid, selected, locale, reportKey]);

  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : copy('Completed quiz', 'แบบทดสอบที่ทำแล้ว');
  const correct = report?.answers.filter((answer) => answer.selectedAligned).length ?? 0;
  const total = report?.answers.length ?? 0;
  const retry = () => setVersion((value) => value + 1);

  return <div className="nq-full-report nq-report-canvas nq-personal-report">
    <div className="pr-wrap">
      <header className="pr-card pr-header">
        <div className="pr-header-top">
          <div className="pr-header-title"><div><h1 className={selected ? undefined : 'sr-only'}>{selected?.session_name ?? copy('History', 'ประวัติ')}</h1></div></div>
          <div className="pr-header-actions">{selected && <Link className="pr-button" href={`/stats?session=${encodeURIComponent(selected.session_id)}`}>{copy('Quiz summary', 'ดูสรุปผล')}</Link>}<IconRefreshButton onRefresh={retry} label={copy('Refresh your history', 'โหลดประวัติของคุณอีกครั้ง')} /></div>
        </div>
        {report && <div className="pr-overview">
          <div className="pr-profile"><ProfileAvatar displayName={user?.displayName} photoURL={user?.photoURL} size={42} /><div><strong>{user?.displayName || copy('Your results', 'ผลของคุณ')}</strong><span>{date(selected?.completed_at ?? null)}</span></div></div>
          <div className="pr-fact"><span>{copy('Questions answered', 'ข้อที่คุณตอบ')}</span><strong>{total}</strong></div>
          <div className="pr-fact pr-fact-good"><span>{copy('Correct answers', 'ตอบถูก')}</span><strong>{correct}<small>{copy(`of ${total} questions`, `จาก ${total} ข้อ`)}</small></strong></div>
          <div className="pr-fact"><span>{copy('Questions to revisit', 'ข้อที่ควรทบทวน')}</span><strong>{total - correct}</strong></div>
        </div>}
      </header>
      {authLoading || (uid && !history) ? <StatePanel message={copy('Loading your quizzes…', 'กำลังโหลดแบบทดสอบของคุณ…')} loading /> : !uid ? <StatePanel message={copy('Sign in to see your quiz history.', 'เข้าสู่ระบบเพื่อดูประวัติแบบทดสอบของคุณ')}><Link className="pr-button" href="/sign-in?next=%2Fhistory">{copy('Sign in', 'เข้าสู่ระบบ')}</Link></StatePanel> : history?.error ? <StatePanel message={copy('Your quizzes couldn’t load. Please try again.', 'ยังโหลดแบบทดสอบไม่ได้ กรุณาลองอีกครั้ง')} error><button className="pr-button" onClick={retry}>{copy('Try again', 'ลองอีกครั้ง')}</button></StatePanel> : !rows.length ? <StatePanel message={copy('Your completed quizzes will appear here.', 'แบบทดสอบที่คุณทำเสร็จแล้วจะแสดงที่นี่')}><Link className="pr-button" href="/quizzes">{copy('Choose a quiz', 'เลือกแบบทดสอบสุขภาพ')}</Link></StatePanel> : <div className="pr-layout">
        <aside className="pr-card pr-archive" aria-labelledby="archive-title">
          <div className="pr-section-heading"><h2 id="archive-title">{copy('Your completed quizzes', 'แบบทดสอบที่คุณทำแล้ว')}</h2><span className="pr-count">{rows.length}</span></div>
          <input className="pr-input" type="search" aria-label={copy('Search your quizzes', 'ค้นหาแบบทดสอบของคุณ')} placeholder={copy('Search your quizzes…', 'ค้นหาแบบทดสอบ…')} value={quizSearch} onChange={(event) => setQuizSearch(event.target.value)} />
          <div className="pr-quiz-list">{rows.filter((row) => row.session_name.toLocaleLowerCase().includes(quizSearch.trim().toLocaleLowerCase())).map((row) => <button type="button" key={row.session_id} className={`pr-quiz ${selectedId === row.session_id ? 'pr-quiz-selected' : ''}`} aria-current={selectedId === row.session_id ? 'page' : undefined} onClick={() => router.push(`/history?session=${encodeURIComponent(row.session_id)}`, { scroll: false })}><strong>{row.session_name}</strong><span>{date(row.completed_at)}</span><small>{copy(`${row.correct_count + row.incorrect_count} questions answered`, `ตอบแล้ว ${row.correct_count + row.incorrect_count} ข้อ`)}</small></button>)}</div>
          {!rows.some((row) => row.session_name.toLocaleLowerCase().includes(quizSearch.trim().toLocaleLowerCase())) && <p className="pr-muted">{copy('No quizzes match your search.', 'ไม่พบแบบทดสอบที่ตรงกับการค้นหา')}</p>}
        </aside>
        <main className="pr-report-content">{!selected ? <StatePanel message={copy('Choose one of your completed quizzes from the list.', 'เลือกแบบทดสอบที่คุณทำแล้วจากรายการ')} /> : !result ? <StatePanel message={copy('Loading your answers…', 'กำลังโหลดคำตอบของคุณ…')} loading /> : result.error ? <StatePanel message={copy('Your answers couldn’t load. Please try again.', 'ยังโหลดคำตอบไม่ได้ กรุณาลองอีกครั้ง')} error><button className="pr-button" onClick={retry}>{copy('Try again', 'ลองอีกครั้ง')}</button></StatePanel> : report && <PersonalReport key={reportKey} report={report} locale={locale} />}</main>
      </div>}
    </div>
  </div>;
}

function PersonalReport({ report, locale }: { report: PersonalHistoryReport; locale: 'en' | 'th' }) {
  const copy = (en: string, th: string) => locale === 'th' ? th : en;
  const [topic, setTopic] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const answerTopics = (answer: HistoryAnswer) => personalLearningAreas([answer], locale);
  const answers = report.answers.filter((answer) => (!onlyReview || !answer.selectedAligned) && (!topic || answer.tags.includes(topic)) && `${answer.question} ${answer.selected} ${answerTopics(answer).map((area) => area.title).join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    <TopicScoreHistogram
      items={report.topics}
      selectedTag={topic}
      onToggleTag={(tag) => { setTopic((previous) => previous === tag ? null : tag); setExpanded(null); }}
    />
    <section className="pr-card pr-questions" aria-labelledby="questions-title">
      <div className="pr-section-heading"><div><h2 id="questions-title">{copy('Answers and explanations', 'คำตอบและเฉลย')} <span className="pr-count">{answers.length}</span></h2><p className="pr-muted">{(topic ? learningTopic(topic, locale)?.title ?? copy('Other quiz topics', 'เรื่องอื่น ๆ ในแบบทดสอบ') : null) ?? copy('Your selected answers and the answer key.', 'คำตอบที่เลือก เทียบกับเฉลย')}</p></div><input className="pr-input" type="search" aria-label={copy('Search your answers', 'ค้นหาคำตอบของคุณ')} placeholder={copy('Search questions…', 'ค้นหาคำถาม…')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <label className="pr-review-filter"><input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} />{copy('Only questions to revisit', 'เฉพาะข้อที่ควรทบทวน')}</label>
      <div className="pr-table-scroll"><table className="pr-table"><thead><tr><th scope="col">{copy('Topic', 'เรื่อง')}</th><th scope="col">{copy('Question', 'คำถาม')}</th><th scope="col">{copy('Your answer', 'คำตอบของคุณ')}</th><th scope="col">{copy('Review', 'ทบทวน')}</th></tr></thead><tbody>
        {answers.map((answer) => <Fragment key={answer.id}><tr><td className="pr-topic-cell">{answerTopics(answer).map((area) => <span key={area.id}>{area.title}</span>)}</td><td className="pr-question-cell">{answer.question}</td><td><span className={`pr-answer-status ${answer.selectedAligned ? 'pr-answer-good' : ''}`}>{answer.selectedAligned ? copy('Answered correctly', 'ตอบถูก') : copy('Questions to review', 'ควรทบทวน')}</span><p>{answer.selected}</p></td><td><button type="button" className="pr-button pr-explain-button" aria-expanded={expanded === answer.id} aria-controls={`answer-${answer.id}`} aria-label={copy(`${expanded === answer.id ? 'Hide' : 'View'} explanation for: ${answer.question}`, `${expanded === answer.id ? 'ซ่อน' : 'ดู'}คำอธิบาย: ${answer.question}`)} onClick={() => setExpanded((previous) => previous === answer.id ? null : answer.id)}>{expanded === answer.id ? copy('Hide explanation', 'ซ่อนคำอธิบาย') : copy('View explanation', 'ดูคำอธิบาย')} {expanded === answer.id ? '−' : '+'}</button></td></tr>
        <tr hidden={expanded !== answer.id} id={`answer-${answer.id}`} className="pr-detail-row"><td colSpan={4}><div className="pr-answer-detail"><div><h3>{copy('What you chose', 'คำตอบที่คุณเลือก')}</h3><p>{answer.selected}</p>{answer.selectedExplanation && <p className="pr-muted">{answer.selectedExplanation}</p>}</div><div>{answer.alignedChoices.map((choice, index) => <div className="pr-accepted" key={index}><h3>{copy('Answer key', 'เฉลย')}</h3><p>{choice.text}</p>{choice.explanation && <p className="pr-muted">{choice.explanation}</p>}</div>)}{!answer.selectedExplanation && !answer.alignedChoices.some((choice) => choice.explanation) && <p className="pr-muted">{copy('There isn’t an explanation for this question yet.', 'คำถามนี้ยังไม่มีคำอธิบาย')}</p>}</div></div></td></tr></Fragment>)}
        {!answers.length && <tr><td colSpan={4} className="pr-no-answers">{copy('No questions match. Try another topic or clear your search.', 'ไม่พบคำถาม ลองเลือกเรื่องอื่นหรือล้างการค้นหา')}</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function StatePanel({ message, loading, error, children }: { message: string; loading?: boolean; error?: boolean; children?: React.ReactNode }) {
  return <section className="pr-card pr-state" role={loading ? 'status' : error ? 'alert' : undefined}><p>{message}</p>{children}</section>;
}
export default function HistoryPage() {
  return <Suspense fallback={<div className="pr-state" role="status" />}><HistoryContent /></Suspense>;
}
