import { SojaError } from '../domain/errors.js';

export interface DisplayError {
  message: string;
  hint: string | undefined;
  /** Stack and causes, only when SOJA_DEBUG is set. */
  debug: string | undefined;
}

export function isDebug(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SOJA_DEBUG && env.SOJA_DEBUG !== '0');
}

/** Turns anything thrown into something safe to show a person. */
export function toDisplayError(error: unknown, debug = isDebug()): DisplayError {
  const details = debug ? describeChain(error) : undefined;
  if (error instanceof SojaError) return { message: error.message, hint: error.hint, debug: details };
  return {
    message: 'Something went wrong.',
    hint: debug ? undefined : 'Run again with SOJA_DEBUG=1 for details.',
    debug: details,
  };
}

function describeChain(error: unknown): string {
  const parts: string[] = [];
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    parts.push(current instanceof Error ? (current.stack ?? current.message) : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join('\n\ncaused by: ');
}
