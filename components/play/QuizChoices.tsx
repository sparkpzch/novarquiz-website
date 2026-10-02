'use client';

import { useEffect, useRef } from 'react';
import type { Choice } from '@/lib/types';
import styles from './quiz.module.css';

export type PlayChoice = Pick<Choice, 'id' | 'label' | 'choice_text'>;
export type AnswerFeedback = { points_earned: number; explanation: string | null };
export const feedbackTone = (points: number) => points > 0 ? 'positive' : points < 0 ? 'negative' : 'neutral';
const impact = (points: number) => points > 0 ? `+${points}` : String(points);

export function QuizChoices({ choices, selectedLabel, feedback, saving, onSelect, th }: {
  choices: readonly PlayChoice[];
  selectedLabel: string | null;
  feedback: AnswerFeedback | null;
  saving: boolean;
  onSelect: (label: string) => void;
  th: boolean;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  return <section className={styles.choices} aria-label={copy('Answer choices', 'ตัวเลือกคำตอบ')} aria-busy={saving}>
    <p className={styles.choiceHint}>{selectedLabel ? saving ? copy('Saving your answer…', 'กำลังบันทึกคำตอบ…') : copy('Your answer is saved', 'บันทึกคำตอบของคุณแล้ว') : copy('Choose the answer that fits best', 'เลือกคำตอบที่เหมาะสมที่สุด')}</p>
    <div className={styles.choiceList}>{choices.map((choice, index) => {
      const selected = choice.label === selectedLabel;
      const tone = selected && feedback ? feedbackTone(feedback.points_earned) : '';
      return <button type="button" key={choice.id || choice.label} className={`${styles.choice} ${selected ? styles.selected : ''} ${tone ? styles[tone] : ''}`} aria-pressed={selected} disabled={saving || selectedLabel !== null} onClick={() => onSelect(choice.label)}>
        <span className={styles.choiceNumber} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className={styles.choiceText}>{choice.choice_text}</span>
        <span className={styles.choiceIndicator} aria-hidden="true">{selected ? saving ? <span className={styles.spinner} /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg> : <span />}</span>
        {selected && feedback && <span className={styles.choiceFeedback}>{copy('Selected', 'คำตอบที่เลือก')} · {impact(feedback.points_earned)} {copy('pts', 'คะแนน')}</span>}
      </button>;
    })}</div>
  </section>;
}

export function AnswerFeedbackDialog({ choice, feedback, nextLoading, error, open, onClose, onContinue, th }: {
  choice: PlayChoice;
  feedback: AnswerFeedback;
  nextLoading: boolean;
  error: string | null;
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  th: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const tone = feedbackTone(feedback.points_earned);
  const copy = (en: string, thai: string) => th ? thai : en;
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return <dialog className={`${styles.feedbackDialog} ${styles[tone]}`} ref={dialog} aria-labelledby="answer-feedback-title" onCancel={(event) => { if (nextLoading) event.preventDefault(); }} onClose={onClose}>
    <div className={styles.feedbackTop}><span className={styles.eyebrow}>{copy('YOUR ANSWER', 'คำตอบของคุณ')}</span><button type="button" className={styles.iconButton} aria-label={copy('Close explanation', 'ปิดคำอธิบาย')} disabled={nextLoading} onClick={onClose}>×</button></div>
    <div className={styles.feedbackMark} aria-hidden="true">{feedback.points_earned > 0 ? '✓' : '↗'}</div>
    <h2 id="answer-feedback-title">{feedback.points_earned > 0 ? copy('Answer feedback', 'ผลการตอบคำถาม') : copy('Answer feedback', 'ผลการตอบคำถาม')}</h2>
    <p className={styles.feedbackScore}>{impact(feedback.points_earned)} {copy('points', 'คะแนน')}</p>
    <div className={styles.selectedAnswer}><small>{copy('You selected', 'คุณเลือก')}</small><p>{choice.choice_text}</p></div>
    <h3>{copy('Why this answer matters', 'คำอธิบายของคำตอบ')}</h3><p className={styles.explanation}>{feedback.explanation || copy('No explanation was provided for this answer.', 'คำตอบนี้ยังไม่มีคำอธิบายเพิ่มเติม')}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="button" className={styles.primaryButton} onClick={onContinue} disabled={nextLoading}>{nextLoading ? copy('Loading…', 'กำลังโหลด…') : copy('Continue', 'ไปต่อ')}<span aria-hidden="true">→</span></button>
  </dialog>;
}
