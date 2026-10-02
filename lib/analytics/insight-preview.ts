/** Keep compact recaps to the first complete sentence; preserve the full text
 * for admin review and existing detailed reports. Thai may omit punctuation. */
export function firstInsightSentence(body: string, locale: 'en' | 'th'): string {
  const text = body.trim();
  if (!text) return '';
  const sentences = new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text);
  return sentences[Symbol.iterator]().next().value?.segment.trim() ?? text;
}
