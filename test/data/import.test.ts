import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import { createRepo, tempDir } from '../helpers.js';
import { FakeSojaServer } from './fake-soja-server.js';

const SERVER = 'https://soja.test';
let dir: ReturnType<typeof tempDir>;
let server: FakeSojaServer;
const runtimes: AppRuntime[] = [];

beforeEach(() => {
  dir = tempDir();
  server = new FakeSojaServer();
});
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  dir.cleanup();
});

/** A developer who used SOJA locally (username michael), then signs in to a team server. */
async function localThenRemote(): Promise<{ remote: AppRuntime; config: MemoryConfigStore; repo: string }> {
  const databaseFile = join(dir.path, 'soja.db');
  const paths = { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', envKeysFile: '', databaseFile };
  const config = new MemoryConfigStore();
  const local = await bootstrap({ paths, config });
  const session = await local.services.session.setup({ displayName: 'Michael', username: 'michael', workspaceName: 'Bravos Local' });
  const repo = join(realpathSync(dir.path), 'repo');
  mkdirSync(repo, { recursive: true });
  createRepo(repo);
  const project = await local.services.projects.create(session, { name: 'EnrollBridge' });
  await local.services.projects.linkRepository(session, project, repo);
  await local.services.tasks.create(session, { title: 'Fix webhook', projectId: project.id });
  await local.services.tasks.create(session, { title: 'Old idea' });
  await local.services.tasks.comment(session, 'SOJA-1', 'Stripe retries');
  await local.services.tasks.archive(session, 'SOJA-2');
  local.close();

  const userId = server.addUser('michael');
  config.save({ ...(config.load() ?? { mode: 'local', parentFolders: [] }), mode: 'remote', remote: { apiUrl: SERVER, userId } });
  const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
  credentials.save(SERVER, server.tokenFor(userId), 'michael');
  const remote = await bootstrap({ paths, config, credentials, fetch: server.fetch, replicaFile: ':memory:' });
  runtimes.push(remote);
  return { remote, config, repo };
}

describe('importing local data to the team', () => {
  it('previews, imports with numbers and folder links kept, and never duplicates', async () => {
    const { remote, repo } = await localThenRemote();
    const session = await remote.services.session.current();
    const importer = remote.services.importer;
    if (!session || !importer) throw new Error('no importer');

    expect(await importer.preview(session)).toMatchObject({ from: { name: 'Bravos Local' }, projects: 1, tasks: 2, comments: 1, developers: ['michael'], alreadyImported: false });
    const outcome = await importer.run(session);
    expect(outcome).toMatchObject({ tasks: 2, comments: 1, renumbered: {}, unmatchedUsers: [], linkedFolders: 1 });

    const all = await remote.services.tasks.list(session, 'all');
    expect(all.map((task) => task.ref)).toEqual(['SOJA-1']);
    expect((await remote.services.tasks.list(session, 'archived')).map((task) => task.ref)).toEqual(['SOJA-2']);
    expect((await remote.services.projects.list(session))[0]?.repositoryPath).toBe(repo);

    expect((await importer.preview(session)).alreadyImported).toBe(true);
    await importer.run(session);
    expect(server.tasks.size).toBe(2);
  });

  it('explains when there is nothing local to import', async () => {
    const userId = server.addUser('michael');
    const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
    credentials.save(SERVER, server.tokenFor(userId), 'michael');
    const remote = await bootstrap({
      paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', envKeysFile: '', databaseFile: join(dir.path, 'none.db') },
      config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, userId } }),
      credentials,
      fetch: server.fetch,
      replicaFile: ':memory:',
    });
    runtimes.push(remote);
    const session = await remote.services.session.current();
    if (!session) throw new Error('no session');
    await expect(remote.services.importer?.preview(session)).rejects.toThrow(/no local SOJA data/);
  });
});
