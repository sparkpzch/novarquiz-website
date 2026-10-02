import type { HistoryAnswer } from './history';
import type { AnswerReviewContext, AnswerReviewItem } from '../db/provisional-insights';

function answerKey(answer: AnswerReviewItem) {
  return JSON.stringify([answer.question, answer.selected, answer.selectedExplanation, answer.selectedAligned,
    answer.alignedChoices.map(choice => JSON.stringify([choice.text, choice.explanation])).sort()]);
}

/** Edges trace saved answer evidence; they are not model weights or confidence. */
export function buildAnswerGraph(answers: HistoryAnswer[], source: AnswerReviewContext | null) {
  const remaining = source?.answers.map(answerKey) ?? [];
  return answers.map((answer, index) => {
    const match = remaining.indexOf(answerKey(answer));
    if (match >= 0) remaining.splice(match, 1);
    const usedForSummary = source !== null && match >= 0;
    const focus = usedForSummary && source?.learningFocus?.question === answer.question;
    return { answer, index, usedForSummary, group: !usedForSummary ? 'additional' : focus ? 'focus' : answer.selectedAligned ? 'strength' : 'revisit' } as const;
  });
}
