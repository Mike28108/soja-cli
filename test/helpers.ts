import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryConfigStore } from '../src/config/config.js';
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

export async function createTestApp(paths: Partial<SojaPaths> = {}): Promise<TestApp> {
  const config = new MemoryConfigStore();
  const runtime = await bootstrap({
    paths: { dataDir: '', configDir: '', configFile: '', databaseFile: ':memory:', ...paths },
    config,
    clock: steppingClock(),
  });
  return { ...runtime, config };
}

export async function createSetUpApp(): Promise<TestApp & { session: Session }> {
  const app = await createTestApp();
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
