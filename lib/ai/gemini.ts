// Minimal Gemini text client, used only to draft insight wording in the CMS.
//
// Nothing a player typed or answered is ever sent here: the prompt is built
// from quiz content an admin authored. That is what makes the free tier
// acceptable — Google may train on free-tier traffic, so personal data must
// not reach it.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * The moving alias, not a pinned id, and deliberately so: verified against the
 * live API on 2026-09-18, pinned ids like `gemini-2.5-flash-lite` already
 * return 404 "no longer available to new users" while this alias resolves to
 * the current lite model. Override with GEMINI_MODEL to pin one anyway.
 */
const DEFAULT_MODEL = 'gemini-flash-lite-latest';

const TIMEOUT_MS = 20_000;

export class GeminiError extends Error {}

export function geminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

type GenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Returns the model's raw text. Callers validate it before storing anything. */
export async function generateText(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${geminiModel()}:generateContent`, {
      method: 'POST',
      // Header rather than ?key= so the secret stays out of URLs and logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 600,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GeminiError(
      (err as Error)?.name === 'AbortError' ? 'Gemini timed out' : 'Gemini request failed',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // The body can echo the request; keep it out of logs and surface the code.
    throw new GeminiError(`Gemini returned ${response.status}`);
  }

  const data = (await response.json()) as GenerateResponse;
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the prompt (${data.promptFeedback.blockReason})`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new GeminiError('Gemini returned an empty response');

  return text;
}
