import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SojaError } from '../domain/errors.js';

/** The user's editor: $VISUAL, then $EDITOR, then vi. May include arguments (`code --wait`). */
export function preferredEditor(env: NodeJS.ProcessEnv = process.env): string {
  return env.VISUAL?.trim() || env.EDITOR?.trim() || 'vi';
}

/**
 * Opens `initial` in the user's editor, attached to the terminal, and
 * returns the saved text (trailing newlines trimmed). Resolves to null when
 * the editor exits with an error, so nothing is changed. The caller must
 * have released the terminal (the TUI suspends itself first).
 */
export async function editInEditor(initial: string, options: { name: string; editor?: string }): Promise<string | null> {
  const dir = mkdtempSync(join(tmpdir(), 'soja-edit-'));
  const file = join(dir, options.name);
  try {
    writeFileSync(file, initial.endsWith('\n') || !initial ? initial : `${initial}\n`, { mode: 0o600 });
    const command = options.editor ?? preferredEditor();
    const code = await new Promise<number>((resolve, reject) => {
      // Through the shell, so "code --wait" and similar editor settings work as in Git.
      const child = spawn(`${command} "$SOJA_EDIT_FILE"`, { shell: true, stdio: 'inherit', env: { ...process.env, SOJA_EDIT_FILE: file } });
      child.on('error', reject);
      child.on('close', (exit) => resolve(exit ?? 1));
    }).catch((error: unknown) => {
      throw new SojaError(`Could not open your editor (${command}).`, { hint: 'Set $EDITOR, e.g. `export EDITOR=nano`.', cause: error });
    });
    if (code !== 0) return null;
    return readFileSync(file, 'utf8').replace(/\s+$/, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
