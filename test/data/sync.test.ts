import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { tempDir } from '../helpers.js';
import { FakeSojaServer } from './fake-soja-server.js';

const SERVER = 'https://soja.test';
let server: FakeSojaServer;
let dir: ReturnType<typeof tempDir>;
const runtimes: AppRuntime[] = [];

interface Client {
  runtime: AppRuntime;
  session: Session;
  sync: () => ReturnType<NonNullable<AppRuntime['services']['sync']>['syncNow']>;
}

async function client(userId: string, replicaFile = ':memory:', config?: MemoryConfigStore): Promise<Client> {
  const store = config ?? new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, userId } });
  const credentials = new CredentialStore(join(dir.path, `credentials-${userId}.json`));
  credentials.save(SERVER, server.tokenFor(userId), 'x');
  const runtime = await bootstrap({
    paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
    config: store,
    credentials,
    fetch: server.fetch,
    replicaFile,
  });
  runtimes.push(runtime);
  const session = await runtime.services.session.current();
  if (!session) throw new Error('no session');
  const control = runtime.services.sync;
  if (!control) throw new Error('remote runtime without sync');
  return { runtime, session, sync: () => control.syncNow(session.workspace.id) };
}

const refs = async (c: Client) => (await c.runtime.services.tasks.list(c.session, 'all')).map((task) => task.ref).sort();
const timeline = async (c: Client, ref: string) =>
  (await c.runtime.services.tasks.get(c.session, ref)).timeline.map((entry) => (entry.kind === 'event' ? entry.text : `💬 ${entry.body}`));

let michaelId: string;
let angelId: string;

beforeEach(() => {
  dir = tempDir();
  server = new FakeSojaServer();
  michaelId = server.addUser('michael');
  angelId = server.addUser('angel');
});
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  dir.cleanup();
});

describe('offline work in remote mode', () => {
  it('creates tasks offline with provisional numbers that become real on sync', async () => {
    const michael = await client(michaelId);
    server.online = false;
    const task = await michael.runtime.services.tasks.create(michael.session, { title: 'Written on a plane' });
    expect(task.ref).toBe('SOJA-?1');
    expect(await refs(michael)).toEqual(['SOJA-?1']);
    await michael.runtime.services.tasks.update(michael.session, 'SOJA-?1', { priority: 'high' });
    await michael.runtime.services.tasks.comment(michael.session, 'SOJA-?1', 'Remember the receipts');

    const offline = await michael.sync();
    expect(offline.online).toBe(false);
    expect((await michael.runtime.services.sync?.status(michael.session.workspace.id))?.pending).toBe(3);

    server.online = true;
    const report = await michael.sync();
    expect(report).toMatchObject({ online: true, pushed: 3, conflicts: 0, rejected: 0 });
    expect(await refs(michael)).toEqual(['SOJA-1']);
    const stored = await michael.runtime.services.tasks.get(michael.session, 'SOJA-1');
    expect(stored).toMatchObject({ id: task.id, priority: 'high' });
    expect(await timeline(michael, 'SOJA-1')).toEqual(['created the task', 'set priority MED → HIGH', '💬 Remember the receipts']);
    expect(server.tasks.size).toBe(1);
  });

  it('numbers offline tasks from two developers consecutively and shares them', async () => {
    const michael = await client(michaelId);
    const angel = await client(angelId);
    server.online = false;
    await michael.runtime.services.tasks.create(michael.session, { title: 'A' });
    await angel.runtime.services.tasks.create(angel.session, { title: 'B' });
    await michael.runtime.services.tasks.create(michael.session, { title: 'C' });
    server.online = true;
    await angel.sync();
    await michael.sync();
    await angel.sync();

    expect(await refs(michael)).toEqual(['SOJA-1', 'SOJA-2', 'SOJA-3']);
    expect(await refs(angel)).toEqual(['SOJA-1', 'SOJA-2', 'SOJA-3']);
    const titles = new Map((await angel.runtime.services.tasks.list(angel.session, 'all')).map((task) => [task.ref, task.title]));
    expect(titles.get('SOJA-1')).toBe('B');
  });

  it('merges edits to different fields and warns about the same field', async () => {
    const michael = await client(michaelId);
    await michael.runtime.services.tasks.create(michael.session, { title: 'Shared' });
    await michael.sync();
    const angel = await client(angelId);
    await angel.sync();

    server.online = false;
    await angel.runtime.services.tasks.update(angel.session, 'SOJA-1', { priority: 'urgent' });
    await michael.runtime.services.tasks.update(michael.session, 'SOJA-1', { title: 'Shared, renamed', priority: 'low' });
    server.online = true;

    expect((await angel.sync()).conflicts).toBe(0);
    const second = await michael.sync();
    expect(second.conflicts).toBe(1);
    const notices = await michael.runtime.services.sync?.notices(michael.session.workspace.id);
    expect(notices).toMatchObject([{ kind: 'conflict', taskRef: 'SOJA-1', field: 'priority', overwritten: 'urgent' }]);

    await angel.sync();
    for (const c of [michael, angel]) {
      expect(await c.runtime.services.tasks.get(c.session, 'SOJA-1')).toMatchObject({ title: 'Shared, renamed', priority: 'low' });
    }
  });

  it('retries after server errors without applying anything twice', async () => {
    const michael = await client(michaelId);
    await michael.runtime.services.tasks.create(michael.session, { title: 'Once' });
    server.opsFailWith = 500;
    const failed = await michael.sync();
    expect(failed).toMatchObject({ online: true });
    expect(failed.error).toMatch(/Server trouble/);
    expect(await refs(michael)).toEqual(['SOJA-?1']);

    server.opsFailWith = null;
    await michael.sync();
    await michael.sync();
    expect(server.tasks.size).toBe(1);
    expect(await refs(michael)).toEqual(['SOJA-1']);
  });

  it('removes a task the server rejected and explains why', async () => {
    const michael = await client(michaelId);
    await michael.runtime.services.tasks.create(michael.session, { title: 'Doomed' });
    server.rejectNext = 'not_a_member';
    const report = await michael.sync();
    expect(report.rejected).toBe(1);
    expect(await refs(michael)).toEqual([]);
    const [notice] = (await michael.runtime.services.sync?.notices(michael.session.workspace.id)) ?? [];
    expect(notice).toMatchObject({ kind: 'rejected', message: 'Could not create SOJA-?1: Rejected by the server.' });
  });

  it('keeps queued edits visible when newer server data arrives', async () => {
    const michael = await client(michaelId);
    await michael.runtime.services.tasks.create(michael.session, { title: 'Original' });
    await michael.sync();
    const task = [...server.tasks.values()][0];

    await michael.runtime.services.tasks.update(michael.session, 'SOJA-1', { title: 'Mine, not sent yet' });
    server.opsFailWith = 503;
    server.serverChange(String(task?.id), { priority: 'urgent' }, angelId);
    await michael.sync();

    expect(await michael.runtime.services.tasks.get(michael.session, 'SOJA-1')).toMatchObject({
      title: 'Mine, not sent yet',
      priority: 'urgent',
    });
  });

  it('survives closing SOJA with operations still queued', async () => {
    const file = join(dir.path, 'replica.db');
    const config = new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, userId: michaelId } });
    const first = await client(michaelId, file, config);
    server.online = false;
    await first.runtime.services.tasks.create(first.session, { title: 'Queued before closing' });
    first.runtime.close();
    runtimes.splice(runtimes.indexOf(first.runtime), 1);

    // Reopened while still offline: the replica has everything.
    const reopened = await client(michaelId, file, config);
    expect(await refs(reopened)).toEqual(['SOJA-?1']);

    server.online = true;
    await reopened.sync();
    expect(await refs(reopened)).toEqual(['SOJA-1']);
    expect([...server.tasks.values()].map((task) => task.title)).toEqual(['Queued before closing']);
  });

  it('opens offline from the replica once it synced, and needs the server the very first time', async () => {
    const config = new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, userId: michaelId } });
    const file = join(dir.path, 'first.db');
    server.online = false;
    await expect(client(michaelId, file, config)).rejects.toThrow('SOJA needs to connect once to download your workspace.');
    server.online = true;
    const online = await client(michaelId, file, config);
    online.runtime.close();
    runtimes.splice(runtimes.indexOf(online.runtime), 1);
    server.online = false;
    const offline = await client(michaelId, file, config);
    expect(offline.session.workspace.name).toBe('Bravos');
  });

  it('needs the server for projects and members, with a clear message', async () => {
    const michael = await client(michaelId);
    server.online = false;
    await expect(michael.runtime.services.projects.create(michael.session, { name: 'EnrollBridge' })).rejects.toThrow(
      'Creating a project needs a connection to the SOJA server.',
    );
    server.online = true;
    const project = await michael.runtime.services.projects.create(michael.session, { name: 'EnrollBridge' });
    expect((await michael.runtime.services.projects.list(michael.session)).map((p) => p.id)).toEqual([project.id]);
  });
});

describe('archiving and deleting in remote mode', () => {
  it('archives offline and the team sees it after syncing; deletes reach everyone', async () => {
    const michael = await client(michaelId);
    const angel = await client(angelId);
    await michael.runtime.services.tasks.create(michael.session, { title: 'Old idea', assigneeId: null });
    await michael.runtime.services.tasks.create(michael.session, { title: 'Mistake', assigneeId: null });
    await michael.sync();
    await angel.sync();

    server.online = false;
    await michael.runtime.services.tasks.archive(michael.session, 'SOJA-1');
    expect(await refs(michael)).toEqual(['SOJA-2']);
    server.online = true;
    // A pull while the archive waits must not bring the task back into the lists.
    server.opsFailWith = 500;
    await michael.sync();
    expect(await refs(michael)).toEqual(['SOJA-2']);
    server.opsFailWith = null;
    await michael.sync();
    await angel.sync();
    expect(await refs(angel)).toEqual(['SOJA-2']);
    expect((await angel.runtime.services.tasks.list(angel.session, 'archived')).map((t) => t.ref)).toEqual(['SOJA-1']);
    expect(await timeline(angel, 'SOJA-1')).toContain('archived the task');

    await michael.runtime.services.tasks.remove(michael.session, 'SOJA-2');
    await michael.sync();
    await angel.sync();
    expect(await refs(angel)).toEqual([]);
    await expect(angel.runtime.services.tasks.get(angel.session, 'SOJA-2')).rejects.toThrow();
  });

  it('brings a task back when the server refuses to delete it', async () => {
    const angel = await client(angelId);
    await angel.runtime.services.tasks.create(angel.session, { title: 'Keep me', assigneeId: null });
    await angel.sync();
    // Angel was an owner when last synced, but is only a member now.
    server.roles.set(angelId, 'member');
    await angel.runtime.services.tasks.remove(angel.session, 'SOJA-1');
    expect(await refs(angel)).toEqual([]);
    const report = await angel.sync();
    expect(report.rejected).toBe(1);
    expect(await refs(angel)).toEqual(['SOJA-1']);
    const notices = await angel.runtime.services.sync?.notices(angel.session.workspace.id);
    expect(notices?.[0]?.message).toMatch(/Could not delete SOJA-1: Only workspace owners/);
  });
});
