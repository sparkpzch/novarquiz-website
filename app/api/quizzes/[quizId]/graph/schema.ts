import { z } from 'zod';

const ALLOWED_MEDIA_ORIGINS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
]);

function isAllowedMediaUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'https:' && ALLOWED_MEDIA_ORIGINS.has(hostname);
  } catch {
    return false;
  }
}

// media_path is handed to adminStorage.bucket().file(path).delete() when a
// node's media is replaced, so it stays allow-listed to the two prefixes this
// app writes to, and rejects "." / ".." segments.
//   quiz-media/<ts>-<rand>.<ext>                         (POST /api/upload)
//   question-sessions/<quizId>/<kind>/<nodeId>_<ts>.<ext> (node-editor upload)
export const MEDIA_PATH_RE =
  /^(?:quiz-media|question-sessions)(?:\/(?!\.\.?(?:\/|$))[\w.-]+){1,4}$/;

export const ChoiceSchema = z.object({
  label: z.string().min(1).max(10),
  choice_text: z.string().max(1000),
  score_impact: z.number().finite().min(-10000).max(10000).optional(),
  // Nullable: choices loaded from Postgres carry explanation === null, and the
  // editor round-trips them back verbatim.
  explanation: z.string().max(2000).nullable().optional(),
  behavior_meaning: z.string().max(2000).nullable().optional(),
  clinical_tags: z.array(z.string().max(120)).max(20).optional(),
});

export const QuestionSchema = z.object({
  // Editor-side node id. replaceQuizGraph keys its idMap on this, so dropping
  // it silently orphans every connection in the saved graph. Non-UUID ids (new
  // nodes) are re-minted server-side.
  id: z.string().min(1).max(200).optional(),
  question_text: z.string().max(5000),
  question_order: z.number().int().min(0),
  node_name: z.string().max(200).nullable().optional(),
  node_type: z.enum(['normal', 'question', 'situation', 'end']).optional(),
  // Dropping this clears the quiz's entry point, which makes
  // GET /api/play/<id>/answer?entry=true 404 and sends players straight to the
  // final leaderboard.
  is_entry_point: z.boolean().optional(),
  timer_override: z.number().int().min(0).max(3600).nullable().optional(),

  media_url: z.string().max(500).optional().nullable().refine(
    (v) => !v || isAllowedMediaUrl(v),
    { message: 'media_url must be an https URL from an allowed storage domain' },
  ),
  media_path: z.string().max(500).optional().nullable().refine(
    (v) => !v || MEDIA_PATH_RE.test(v),
    { message: 'media_path must be a path inside an allowed storage prefix' },
  ),
  media_type: z.enum(['image', 'gif', 'video']).optional().nullable(),
  node_x: z.number().finite().optional(),
  node_y: z.number().finite().optional(),
  choices: z.array(ChoiceSchema).max(20).optional(),
});

export const ConnectionSchema = z.object({
  from_question_id: z.string(),
  to_question_id: z.string(),
  from_choice_label: z.string().max(10),
});

export const GraphBody = z.object({
  questions: z.array(QuestionSchema).max(500),
  connections: z.array(ConnectionSchema).max(2000),
});
