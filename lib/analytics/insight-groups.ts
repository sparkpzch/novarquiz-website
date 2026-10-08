import type { ProvisionalInsight } from '../db/provisional-insights';

export type InsightGroup = ProvisionalInsight & { members: ProvisionalInsight[] };

/** Compare the recorded evidence, including answer keys and explanations.
 * The derived topic title is localized, so it is not part of the identity. */
export function insightGroupKey(row: ProvisionalInsight): string {
  if (!row.answer_context?.answers.length) {
    const anchor = row.answer_context?.translationOf ?? (row.answer_signature.startsWith('translation:') ? row.answer_signature.slice(12) : row.answer_signature.startsWith('retained-group:') ? row.answer_signature.split(':')[1] : row.id);
    return `legacy:${anchor}`;
  }
  const answers = row.answer_context.answers.map(answer => ({
    question: answer.question, selected: answer.selected,
    selectedExplanation: answer.selectedExplanation, selectedAligned: answer.selectedAligned,
    alignedChoices: [...answer.alignedChoices].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([row.quiz_id, row.audience, row.answer_context.quizName,
    row.answer_context.quizDescription, answers, row.status === 'rejected' ? 'archived' : 'active']);
}

export function groupProvisionalInsights(rows: ProvisionalInsight[]): InsightGroup[] {
  const groups = new Map<string, ProvisionalInsight[]>();
  for (const row of rows) {
    const key = insightGroupKey(row);
    const members = groups.get(key) ?? [];
    members.push(row);
    groups.set(key, members);
  }
  return [...groups.values()].map(members => {
    members.sort((a, b) => Number(b.locale === 'th') - Number(a.locale === 'th') || a.id.localeCompare(b.id));
    const representative = members.find(row => row.locale === 'th') ?? members[0];
    return {
      ...representative,
      id: [...members].map(row => row.id).sort()[0],
      status: members.every(row => row.status === 'approved') && hasBothInsightLanguages(members) ? 'approved' : members.some(row => row.status === 'provisional' || row.status === 'approved') ? 'provisional' : representative.status,
      members,
    };
  });
}

export function hasBothInsightLanguages(members: ProvisionalInsight[]): boolean {
  return members.some(row => row.locale === 'th') && members.some(row => row.locale === 'en');
}
