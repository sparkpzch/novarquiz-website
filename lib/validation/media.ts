import { z } from 'zod';

export const muxDirectUploadBodySchema = z.object({
  questionId: z.string().min(1),
  quizId: z.string().min(1).optional(),
  fileName: z.string().min(1).max(240).optional(),
});

export const graphChoiceSchema = z.object({
  label: z.string().min(1).max(24),
  choice_text: z.string().max(2000),
  score_impact: z.number().finite().optional(),
  points: z.number().finite().optional(),
  explanation: z.string().max(4000).nullable().optional(),
});

export const graphQuestionSchema = z.object({
  id: z.string().optional(),
  question_order: z.number().int().min(0),
  question_text: z.string().max(8000),
  node_name: z.string().max(240).nullable().optional(),
  media_type: z.enum(['image', 'gif', 'video']).nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_path: z.string().nullable().optional(),
  media_provider: z.enum(['firebase', 'mux']).nullable().optional(),
  mux_upload_id: z.string().nullable().optional(),
  mux_asset_id: z.string().nullable().optional(),
  mux_playback_id: z.string().nullable().optional(),
  mux_status: z.enum(['waiting', 'preparing', 'ready', 'errored']).nullable().optional(),
  timer_override: z.number().int().min(1).max(3600).nullable().optional(),
  is_entry_point: z.boolean().optional(),
  node_x: z.number().finite().optional(),
  node_y: z.number().finite().optional(),
  node_type: z.string().max(40).optional(),
  choices: z.array(graphChoiceSchema).optional(),
});

export const graphConnectionSchema = z.object({
  from_question_id: z.string().min(1),
  from_choice_label: z.string().min(1).max(24),
  to_question_id: z.string().min(1),
});

export const replaceQuizGraphBodySchema = z.object({
  questions: z.array(graphQuestionSchema),
  connections: z.array(graphConnectionSchema),
});
