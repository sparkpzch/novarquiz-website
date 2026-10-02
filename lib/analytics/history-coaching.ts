import type { InsightLocale, InsightSummary } from './insights';
import type { HistoryAnswer, PersonalHistoryReport } from './history';

type TopicIcon = 'plan' | 'heart' | 'checkup' | 'help' | 'move' | 'notice' | 'food' | 'learn';
type TopicWords = { title: string; description: string; icon: TopicIcon };
const topicWords: Record<string, { en: TopicWords; th: TopicWords }> = {
  adherence: {
    en: { title: 'Following a care plan', description: 'Remembering the steps in a plan.', icon: 'plan' },
    th: { title: 'ทำตามแผนดูแลสุขภาพ', description: 'จำขั้นตอนในแผนให้เข้าใจมากขึ้น', icon: 'plan' },
  },
  riskfactors: {
    en: { title: 'What can affect your health', description: 'Understanding the things that can affect health.', icon: 'heart' },
    th: { title: 'สิ่งที่อาจส่งผลต่อสุขภาพ', description: 'เข้าใจสิ่งต่าง ๆ ที่อาจส่งผลต่อสุขภาพ', icon: 'heart' },
  },
  screening: {
    en: { title: 'Check-ups and early checks', description: 'Understanding the check-ups covered in your quiz.', icon: 'checkup' },
    th: { title: 'การตรวจและเช็กสุขภาพ', description: 'เข้าใจเรื่องการตรวจสุขภาพจากแบบทดสอบ', icon: 'checkup' },
  },
  emergency: {
    en: { title: 'Knowing when to get help', description: 'Recognising situations that need help.', icon: 'help' },
    th: { title: 'รู้ว่าเมื่อไรควรขอความช่วยเหลือ', description: 'เข้าใจสถานการณ์ที่ต้องขอความช่วยเหลือ', icon: 'help' },
  },
  exercise: {
    en: { title: 'Staying active', description: 'Understanding everyday movement and exercise.', icon: 'move' },
    th: { title: 'ขยับร่างกายและออกกำลังกาย', description: 'เข้าใจเรื่องการเคลื่อนไหวและออกกำลังกาย', icon: 'move' },
  },
  symptomawareness: {
    en: { title: 'Noticing warning signs', description: 'Recognising the signs described in your quiz.', icon: 'notice' },
    th: { title: 'สังเกตสัญญาณเตือน', description: 'เข้าใจสัญญาณที่กล่าวถึงในแบบทดสอบ', icon: 'notice' },
  },
  nutritionguidelines: {
    en: { title: 'Everyday food choices', description: 'Understanding food choices in your quiz.', icon: 'food' },
    th: { title: 'เลือกอาหารในชีวิตประจำวัน', description: 'เข้าใจเรื่องการเลือกอาหารจากแบบทดสอบ', icon: 'food' },
  },
  heartdiseasesymptoms: {
    en: { title: 'Recognising heart-related symptoms', description: 'Understanding the signs covered in your quiz.', icon: 'notice' },
    th: { title: 'รู้จักอาการที่เกี่ยวกับหัวใจ', description: 'เข้าใจอาการที่กล่าวถึงในแบบทดสอบ', icon: 'notice' },
  },
  ldltargets: {
    en: { title: 'Understanding cholesterol', description: 'Making sense of the cholesterol questions.', icon: 'heart' },
    th: { title: 'เข้าใจเรื่องคอเลสเตอรอล', description: 'ทำความเข้าใจคำถามเกี่ยวกับคอเลสเตอรอล', icon: 'heart' },
  },
  sglt2idosage: {
    en: { title: 'Understanding medicine instructions', description: 'Understanding the instructions described in your quiz.', icon: 'plan' },
    th: { title: 'เข้าใจคำแนะนำเกี่ยวกับยา', description: 'ทำความเข้าใจคำแนะนำที่กล่าวถึงในแบบทดสอบ', icon: 'plan' },
  },
};

const aliases: Record<string, string> = {
  physicalactivity: 'exercise', movement: 'exercise', nutrition: 'nutritionguidelines', diet: 'nutritionguidelines',
  symptoms: 'symptomawareness', warningsigns: 'symptomawareness', checkups: 'screening', medicationadherence: 'adherence',
};

export function learningTopic(tag: string, locale: InsightLocale): TopicWords | null {
  const key = tag.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return topicWords[aliases[key] ?? key]?.[locale] ?? null;
}

/** Existing summaries can be written for professionals. The consumer page
 * uses simple factual copy unless the summary is suitable for everyday readers. */
export function isEverydayInsight(summary: InsightSummary): boolean {
  const text = `${summary.headline} ${summary.body} ${summary.suggestion ?? ''}`;
  return !/\b(?:score|rank|streak|accuracy|adherence|screening|clinical|clinician|cohort|utility|aligned|distractor|pedagogical|guideline|provisional|comprehension|risk_factors|symptom_awareness|SGLT2i|LDL|HRV)\b|#[\w-]+|\b\w+_\w+\b|การยึดมั่น|อรรถประโยชน์|กลุ่มตัวอย่าง|ความเข้าใจเชิงคลินิก/i.test(text);
}

export type LearningArea = TopicWords & { id: string; correct: number; total: number; reviewIds: string[] };

export function personalLearningAreas(answers: HistoryAnswer[], locale: InsightLocale): LearningArea[] {
  const areas = new Map<string, LearningArea>();
  const other = locale === 'th'
    ? { title: 'คำถามอื่น ๆ ในแบบทดสอบนี้', description: 'เรียนรู้จากคำตอบที่คุณเลือก', icon: 'learn' as const }
    : { title: 'Other questions in this quiz', description: 'Learning from the answers you chose.', icon: 'learn' as const };
  for (const answer of answers) {
    const mapped = answer.tags.map((tag) => learningTopic(tag, locale)).filter((item): item is TopicWords => item !== null);
    const unique = new Map((mapped.length ? mapped : [other]).map((topic) => [topic.title, topic]));
    for (const [id, words] of unique) {
      const area = areas.get(id) ?? { ...words, id, correct: 0, total: 0, reviewIds: [] };
      area.total += 1;
      if (answer.selectedAligned) area.correct += 1;
      else area.reviewIds.push(answer.id);
      areas.set(id, area);
    }
  }
  return [...areas.values()];
}

/** Only quiz performance is described. No real-world health state, medical
 * need, or change over time is inferred from a quiz answer. */
export function historyCoaching(report: PersonalHistoryReport, locale: InsightLocale) {
  const answers = report.answers;
  const correct = answers.filter((answer) => answer.selectedAligned).length;
  const review = answers.filter((answer) => !answer.selectedAligned);
  const areas = personalLearningAreas(answers, locale);
  const strengths = areas.filter((area) => area.reviewIds.length === 0).sort((a, b) => b.total - a.total);
  const practice = areas.filter((area) => area.reviewIds.length > 0).sort((a, b) => b.reviewIds.length - a.reviewIds.length);
  const nextAnswer = answers.find((answer) => answer.id === practice[0]?.reviewIds[0]) ?? review[0] ?? answers[0] ?? null;
  const nextTopics = nextAnswer ? personalLearningAreas([nextAnswer], locale) : [];
  const nextArea = nextAnswer
    ? practice.find((area) => area.reviewIds.includes(nextAnswer.id)) ?? areas.find((area) => nextTopics.some((topic) => topic.id === area.id)) ?? null
    : null;
  const headline = !answers.length
    ? (locale === 'th' ? 'ยังไม่มีคำตอบให้ทบทวน' : 'No quiz answers yet')
    : review.length === 0
      ? (locale === 'th' ? 'ตอบถูกทุกข้อ' : 'All answers correct')
      : (locale === 'th' ? `ลองทบทวน: ${nextArea?.title ?? 'คำถามที่คุณตอบพลาด'}` : `Review: ${nextArea?.title ?? 'the questions you missed'}`);
  const body = !answers.length
    ? (locale === 'th' ? 'เลือกแบบทดสอบที่ทำเสร็จแล้วเพื่อดูผล' : 'Choose a completed quiz to see the results.')
    : locale === 'th'
      ? `ตอบถูก ${correct} จาก ${answers.length} ข้อ${review.length ? ` มี ${review.length} ข้อที่ควรทบทวน` : ''}`
      : `${correct} of ${answers.length} answers correct.${review.length ? ` ${review.length} to review.` : ''}`;
  return { correct, total: answers.length, review, strengths, practice, nextAnswer, nextArea, headline, body };
}
