import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

/** Trimmed optional text: blank becomes null, absent stays undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep it under ${max} characters.` })
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,31}$/, {
    error: 'Usernames use lowercase letters, numbers, dots, dashes or underscores (max 32).',
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'A name is required.' })
  .max(60, { error: 'Keep the name under 60 characters.' });

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new ValidationError(`${field}${issue?.message ?? 'Invalid input.'}`);
}
