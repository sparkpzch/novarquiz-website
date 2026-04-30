import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ValidationFailure = {
  error: string;
  issues: z.core.$ZodIssue[];
};

export function validationError(error: z.ZodError) {
  return NextResponse.json<ValidationFailure>(
    {
      error: 'Invalid request',
      issues: error.issues,
    },
    { status: 400 },
  );
}

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | NextResponse<ValidationFailure>> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return parsed.data;
}

export const idParamSchema = z.object({
  id: z.string().min(1),
});
