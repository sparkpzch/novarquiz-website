// Reviewed insight templates and the shared validation used by AI drafts.
// Player feedback uses reviewed summary templates and clearly marked drafts.

import type { IntendedAudience } from './quiz-metadata';

/** All reviewed summary templates now apply to any player. */
export const ANY_ARCHETYPE = '*';
export const ARCHETYPE_KEYS = [ANY_ARCHETYPE] as const;

export const INSIGHT_LOCALES = ['th', 'en'] as const;
export type InsightLocale = (typeof INSIGHT_LOCALES)[number];

export const INSIGHT_REVIEW_STATUSES = ['draft', 'reviewed', 'approved'] as const;
export type InsightReviewStatus = (typeof INSIGHT_REVIEW_STATUSES)[number];

export type InsightTemplate = {
  id: string;
  quiz_id: string | null;
  archetype_id: string;
  clinical_tag: string;
  audience: IntendedAudience;
  locale: InsightLocale;
  headline: string;
  body: string;
  suggestion: string | null;
  review_status: InsightReviewStatus;
  source: 'manual' | 'llm_draft';
  model: string | null;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

/** What a player is shown. A strict subset of the template — no review metadata. */
export type InsightSummary = Pick<InsightTemplate, 'headline' | 'body' | 'suggestion'>;

export const HEADLINE_MAX = 120;
// 200, not 400: at 400 a Thai body runs ~6 lines on a phone and pushes the
// gauge and the topic bars off the first screen. This bound is enforced twice —
// it is quoted into the prompt and re-checked by the validator — so lowering it
// changes what the model drafts, not just what is accepted.
export const BODY_MAX = 200;
export const SUGGESTION_MAX = 200;

// ── Resolution ──────────────────────────────────────────────────────────────

/** The fields resolution reads. Anything with these can be ranked. */
export type ResolvableTemplate = {
  quiz_id: string | null;
  archetype_id: string;
  clinical_tag: string;
};

/**
 * Pick the one summary a player should read, most specific first:
 * quiz-scoped over global, tag-scoped over tag-agnostic, and among tagged
 * rows the tag the player missed most.
 *
 * Callers pass only rows that are already approved and already filtered to the
 * right audience and locale. Shared by the player lookup and the admin
 * breakdown so the two can never disagree about who sees what.
 */
export function pickInsightTemplate<T extends ResolvableTemplate>(
  rows: readonly T[],
  opts: { quizId: string | null; tags: readonly string[] },
): T | null {
  const eligible = rows.filter(
    (r) =>
      (r.quiz_id === null || r.quiz_id === opts.quizId) &&
      r.archetype_id === ANY_ARCHETYPE &&
      (r.clinical_tag === '' || opts.tags.includes(r.clinical_tag)),
  );

  const rank = (r: T) => [
    r.quiz_id !== null ? 0 : 1,
    r.clinical_tag !== '' ? 0 : 1,
    r.clinical_tag !== '' ? opts.tags.indexOf(r.clinical_tag) : Number.MAX_SAFE_INTEGER,
  ];

  return (
    eligible.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return 0;
    })[0] ?? null
  );
}

// ── Draft validation ────────────────────────────────────────────────────────

// A drafted summary describes what the player's *answers* showed and what to
// discuss with a clinician. It must not name a condition as theirs, name a
// drug, or tell them to change treatment — those are claims only a reviewed
// medical source can make, and a model has no basis for them here.
const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/\b(you (have|are suffering from)|you['’]?ve got)\b/i, 'diagnoses the player'],
  [/คุณ(เป็น|ป่วยเป็น|กำลังเป็น)(โรค|เบาหวาน|ความดัน|มะเร็ง)/, 'diagnoses the player'],
  [/\b(mg|mcg|dose|dosage|prescribe|prescription)\b/i, 'gives dosing or prescribing advice'],
  [/(ขนาดยา|สั่งยา|จ่ายยา|กินยา|หยุดยา|ปรับยา)/, 'gives medication advice'],
  [/\b(diagnos(is|ed|e)|treatment plan|cure)\b/i, 'makes a clinical determination'],
  [/(วินิจฉัย|รักษาหาย|แผนการรักษา)/, 'makes a clinical determination'],
];

export type DraftValidation = { ok: true; value: InsightSummary } | { ok: false; reason: string };

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate a model-drafted summary before it is stored or displayed.
 * This catches basic risky claims; provisional copy remains visibly marked
 * until a human reviews it.
 */
export function validateInsightDraft(input: unknown): DraftValidation {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'not an object' };

  const raw = input as Record<string, unknown>;
  const headline = trimmed(raw.headline);
  const body = trimmed(raw.body);
  const suggestion = trimmed(raw.suggestion);

  if (!headline) return { ok: false, reason: 'headline is empty' };
  if (!body) return { ok: false, reason: 'body is empty' };
  if (headline.length > HEADLINE_MAX) return { ok: false, reason: 'headline is too long' };
  if (body.length > BODY_MAX) return { ok: false, reason: 'body is too long' };
  if (suggestion.length > SUGGESTION_MAX) return { ok: false, reason: 'suggestion is too long' };

  const joined = `${headline}\n${body}\n${suggestion}`;
  for (const [pattern, reason] of FORBIDDEN_PATTERNS) {
    if (pattern.test(joined)) return { ok: false, reason: `draft ${reason}` };
  }

  return { ok: true, value: { headline, body, suggestion: suggestion || null } };
}

/** Strip the ```json fence models often wrap structured output in. */
export function parseDraftResponse(text: string): DraftValidation {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return validateInsightDraft(JSON.parse(unfenced));
  } catch {
    return { ok: false, reason: 'response was not valid JSON' };
  }
}

export function matchesInsightLanguage(value: string, locale: InsightLocale): boolean {
  const thai = (value.match(/[\u0E01-\u0E5B]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  return locale === 'th'
    ? thai >= 2 && thai >= latin * 0.15
    : latin >= 3 && latin >= thai * 0.5;
}

/** Check the generated prose, not the quiz source, before saving an AI draft. */
export function validateInsightLanguage(summary: InsightSummary, locale: InsightLocale): boolean {
  const fields = [summary.headline, summary.body, summary.suggestion].filter((value): value is string => Boolean(value));
  return fields.every((value, index) => {
    const thai = (value.match(/[\u0E01-\u0E5B]/g) ?? []).length;
    const latin = (value.match(/[A-Za-z]/g) ?? []).length;
    const minimum = index === 1 ? 12 : 2;
    return matchesInsightLanguage(value, locale) && (locale === 'th' ? thai >= minimum : latin >= (index === 1 ? 15 : 3));
  });
}

// ── Prompt ──────────────────────────────────────────────────────────────────

/** One quiz scenario and every authored answer the model may compare. */
export type DraftScenario = {
  question: string;
  choices: Array<{
    text: string;
    /** Positive choices meet the learning objective; the rest miss it. */
    outcome: 'aligned' | 'off_target';
    /** Optional author-reviewed context for why this choice matters. */
    meaning: string | null;
  }>;
};

export type DraftContext = {
  quizName: string;
  quizDescription: string | null;
  clinicalTag: string;
  audience: IntendedAudience;
  locale: InsightLocale;
  /**
   * The grounding material. Question and choice text is authored content that
   * exists in every quiz, so drafting works without anyone filling in the
   * choice profile metadata first.
   */
  scenarios: DraftScenario[];
};

export function buildInsightPrompt(context: DraftContext): string {
  const language = context.locale === 'th' ? 'Thai' : 'English';
  const reader =
    context.audience === 'hcp'
      ? 'a healthcare professional reviewing their own answers'
      : 'a member of the public with no medical training';

  const scenarios = context.scenarios.flatMap((scenario, index) => [
    `${index + 1}. ${scenario.question}`,
    ...scenario.choices.map(
      (choice) =>
        `   - ${choice.outcome === 'aligned' ? 'aligns with the objective' : 'misses the objective'}: ` +
        `${choice.text}${choice.meaning ? ` — ${choice.meaning}` : ''}`,
    ),
  ]);

  return [
    `You are writing one short summary that ${reader} will read on their personal stats page`,
    `after playing the quiz "${context.quizName}".`,
    context.quizDescription ? `The quiz is about: ${context.quizDescription}` : '',
    '',
    'The relevant situations and every answer choice, exactly as the quiz author wrote them.',
    'The labels say whether each choice meets the learning objective. This is your ONLY source of fact:',
    ...scenarios,
    '',
    context.clinicalTag ? `Topic they most often got wrong: ${context.clinicalTag}` : '',
    '',
    'Rules:',
    `- Write headline, body, and suggestion in ${language}, in plain everyday words. No clinical jargon.`,
    context.locale === 'th'
      ? '- สำคัญ: ทั้งสามช่องต้องเป็นภาษาไทย แม้คำถามหรือคำตอบต้นทางจะเป็นภาษาอังกฤษ'
      : '- Important: all three fields must be in English even when the quiz source is Thai.',
    '- Describe what their ANSWERS showed. Never state or imply that they have a condition.',
    '- Never name a medicine, a dose, or tell them to start, stop or change any treatment.',
    '- Do not introduce any fact that is not in the list above.',
    '- Write to the reader as "you". Do not name any character from the quiz story.',
    '- Encouraging and matter-of-fact. Not alarming.',
    `- headline: at most ${HEADLINE_MAX} characters.`,
    `- body: 2-3 sentences, at most ${BODY_MAX} characters.`,
    `- suggestion: one concrete next step, at most ${SUGGESTION_MAX} characters.`,
    '',
    'Reply with JSON only: {"headline": "...", "body": "...", "suggestion": "..."}',
  ]
    .filter(Boolean)
    .join('\n');
}
