import { parseArgs, type ParseArgsConfig } from 'node:util';
import { ValidationError } from '../../domain/errors.js';

type Options = NonNullable<ParseArgsConfig['options']>;

/** Strict option parsing with friendly errors instead of Node's stack traces. */
export function parseCommand<T extends Options>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.split(/(?<=\.) /)[0] : 'Invalid arguments.';
    throw new ValidationError(message ?? 'Invalid arguments.', { hint: 'See `soja --help`.' });
  }
}

export function requireArg(value: string | undefined, what: string, usage: string): string {
  if (!value) throw new ValidationError(`Missing ${what}.`, { hint: `Usage: ${usage}` });
  return value;
}

export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], what: string): T | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[-\s]/g, '_');
  const alias = normalized === 'med' ? 'medium' : normalized;
  const match = allowed.find((candidate) => candidate === alias);
  if (!match) throw new ValidationError(`Unknown ${what} “${value}”.`, { hint: `Use one of: ${allowed.join(', ')}.` });
  return match;
}
