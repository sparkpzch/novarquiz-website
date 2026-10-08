import { z } from 'zod';

export const AnswerBody = z.object({
  attempt: z.string().uuid().optional(),
  question_id: z.string().uuid(),
  chosen_label: z.string().min(1).max(10),
  question_token: z.string().optional(),
  // Preserve elapsed time after resuming, within the database INTEGER range.
  time_taken_ms: z.number().int().min(0).max(2_147_483_647),
  is_guest: z.boolean().optional(),
});
