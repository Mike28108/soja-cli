import { createInterface } from 'node:readline/promises';
import { ValidationError } from '../domain/errors.js';
import { dim } from './output.js';

/** Yes/no on the terminal; `--yes` skips it, and without a terminal it refuses. */
export async function confirm(question: string, yes: boolean | undefined): Promise<boolean> {
  if (yes) return true;
  const answer = await ask(`${question} ${dim('[y/N]')} `);
  return /^y(es)?$/i.test(answer.trim());
}

/** For what cannot be undone: the answer must be exactly `expected`. */
export async function confirmTyped(question: string, expected: string, yes: boolean | undefined): Promise<boolean> {
  if (yes) return true;
  const answer = await ask(`${question} ${dim(`Type ${expected} to confirm:`)} `);
  return answer.trim().toUpperCase() === expected.toUpperCase();
}

async function ask(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new ValidationError('Refusing to continue without confirmation.', { hint: 'Pass --yes.' });
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}
