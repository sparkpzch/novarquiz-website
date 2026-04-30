import { z } from 'zod';

export const startAnswerBodySchema = z.object({
  action: z.literal('start'),
  is_guest: z.boolean().optional(),
  user_id: z.string().min(1).optional(),
});

export const saveAnswerBodySchema = z.object({
  action: z.string().optional(),
  is_guest: z.boolean().optional(),
  user_id: z.string().min(1),
  question_id: z.string().min(1),
  chosen_label: z.string().min(1).max(24),
  time_taken_ms: z.number().int().min(0).optional(),
});

export const answerBodySchema = z.union([startAnswerBodySchema, saveAnswerBodySchema]);
