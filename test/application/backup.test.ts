import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restoreBackup } from '../../src/application/services/backup-service.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { MemoryConfigStore } from '../../src/config/config.js';
import { tempDir } from '../helpers.js';

let dir: ReturnType<typeof tempDir>;
let now: Date;
const runtimes: AppRuntime[] = [];

async function open(): Promise<AppRuntime> {
  const runtime = await bootstrap({
    paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: join(dir.path, 'soja.db') },
    config: config,
    clock: () => now,
  });
  runtimes.push(runtime);
  return runtime;
}
let config: MemoryConfigStore;

beforeEach(() => {
  dir = tempDir();
  now = new Date('2026-09-24T10:00:00Z');
  config = new MemoryConfigStore();
});
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  dir.cleanup();
});

describe('backups', () => {
  it('copies the database, once a day automatically, keeping the last seven', async () => {
    const runtime = await open();
    const { backups } = runtime.services;
    expect(backups.auto()).not.toBeNull();
    expect(backups.auto()).toBeNull(); // same day
    for (let day = 1; day <= 8; day += 1) {
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1000);
      backups.auto();
    }
    now = new Date(now.getTime() + 1000);
    backups.create('manual');
    const list = backups.list();
    expect(list.filter((backup) => backup.kind === 'auto')).toHaveLength(7);
    expect(list.filter((backup) => backup.kind === 'manual')).toHaveLength(1);
    expect(list[0]?.kind).toBe('manual'); // newest first
    expect(list.every((backup) => backup.name.startsWith('soja-local-'))).toBe(true);
  });

  it('restores a copy, keeping the state it replaces', async () => {
    const runtime = await open();
    const session = await runtime.services.session.setup({ displayName: 'Michael', username: 'michael', workspaceName: 'Bravos' });
    await runtime.services.tasks.create(session, { title: 'Before the backup' });
    const backup = runtime.services.backups.create('manual');
    await runtime.services.tasks.create(session, { title: 'After the backup' });
    runtime.close();

    now = new Date(now.getTime() + 60_000);
    const saved = restoreBackup(backup, join(dir.path, 'soja.db'), join(dir.path, 'backups'), 'local', () => now);
    expect(saved?.kind).toBe('before-restore');
    expect(existsSync(saved?.path ?? '')).toBe(true);

    const reopened = await open();
    const again = await reopened.services.session.current();
    if (!again) throw new Error('no session');
    expect((await reopened.services.tasks.list(again, 'all')).map((task) => task.title)).toEqual(['Before the backup']);
  });
});
