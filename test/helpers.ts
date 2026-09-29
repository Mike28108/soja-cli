import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { MemoryConfigStore } from '../src/config/config.js';
import type { GitClient } from '../src/git/types.js';
import type { SojaPaths } from '../src/config/paths.js';
import type { Session } from '../src/application/types.js';
import { bootstrap, type AppRuntime } from '../src/bootstrap.js';

/** A clock that advances one second per call, so timelines have a stable order. */
export function steppingClock(start = new Date('2026-09-01T09:00:00Z')): () => Date {
  let current = start.getTime();
  return () => new Date((current += 1000));
}

export interface TestApp extends AppRuntime {
  config: MemoryConfigStore;
}

export async function createTestApp(paths: Partial<SojaPaths> = {}, git?: GitClient): Promise<TestApp> {
  const config = new MemoryConfigStore();
  const runtime = await bootstrap({
    paths: { dataDir: '', configDir: '', configFile: '', credentialsFile: '', envKeysFile: '', databaseFile: ':memory:', ...paths },
    config,
    clock: steppingClock(),
    ...(git ? { git } : {}),
  });
  return { ...runtime, config };
}

export async function createSetUpApp(git?: GitClient): Promise<TestApp & { session: Session }> {
  const app = await createTestApp({}, git);
  const session = await app.services.session.setup({
    displayName: 'Michael',
    username: 'michael',
    workspaceName: 'Bravos Development',
  });
  return { ...app, session };
}

export function tempDir(): { path: string; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'soja-test-'));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

/** Runs git in `cwd` with a fixed identity; returns trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  }).trim();
}

/** A fresh repository on `main` with one commit. */
export function createRepo(dir: string): string {
  git(dir, 'init', '--quiet', '--initial-branch=main');
  commitFile(dir, 'README.md', 'hello', 'Initial commit');
  return dir;
}

export function commitFile(dir: string, file: string, content: string, message: string): void {
  writeFileSync(`${dir}/${file}`, content);
  git(dir, 'add', file);
  git(dir, 'commit', '--quiet', '-m', message);
}

/**
 * Polls the rendered frame until `done` holds, then returns it. UI tests wait
 * for what they assert instead of a fixed delay, which breaks on a loaded
 * machine (a slow search still shows the results of an earlier keystroke).
 * On timeout it returns the last frame, so the assertion reports what was on screen.
 */
export async function waitForFrame(lastFrame: () => string | undefined, done: (frame: string) => boolean, timeoutMs = 3000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const frame = lastFrame() ?? '';
    if (done(frame) || Date.now() > deadline) return frame;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
