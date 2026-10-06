import { getQuizById, getUserConsent } from '../db/queries';
import type { HistoryAnswer, UserHistoryRow } from '../analytics/history';
import { historyCoaching } from '../analytics/history-coaching';
import { PRIVACY_VERSION } from '../privacy/versions';
import { prepareProvisionalInsight, type InsightDependencies, type PreparedInsight } from './auto-provisional-insight';

/** Home, Stats, and quiz completion share the same completed-answer context.
 * Personal identity and health profile never enter the model input. */
export async function preparePersonalRecap(
  uid: string, session: UserHistoryRow, answers: HistoryAnswer[], locale: 'en' | 'th', dependencies?: InsightDependencies,
  options: { readOnly?: boolean } = {},
): Promise<PreparedInsight> {
  if (!session.quiz_id || !answers.length) return { state: 'unavailable' };
  const [quiz, consent] = await Promise.all([getQuizById(session.quiz_id), options.readOnly ? Promise.resolve(null) : getUserConsent(uid)]);
  const coaching = historyCoaching({ session, answers, topics: [], feedback: null }, locale);
  const missedTags = new Map<string, number>();
  for (const answer of answers.filter(answer => !answer.selectedAligned)) {
    for (const tag of new Set(answer.tags)) missedTags.set(tag, (missedTags.get(tag) ?? 0) + 1);
  }
  return prepareProvisionalInsight({
    userId: uid, quizId: session.quiz_id, audience: quiz?.intended_audience === 'hcp' ? 'hcp' : 'public',
    locale, readingStyle: 'everyday', allowGeneration: consent?.privacy_version === PRIVACY_VERSION, readOnly: options.readOnly,
    tags: [...missedTags].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag),
    context: {
      quizName: quiz?.name ?? session.session_name, quizDescription: quiz?.description ?? session.session_description,
      answers: answers.map(({ question, selected, selectedExplanation, selectedAligned, alignedChoices }) => ({ question, selected, selectedExplanation, selectedAligned, alignedChoices })),
      ...(coaching.nextAnswer && coaching.nextArea ? { learningFocus: { topic: coaching.nextArea.title, question: coaching.nextAnswer.question } } : {}),
    },
  }, dependencies);
}
