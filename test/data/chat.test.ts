import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatOperations } from '../../src/application/chat.js';
import type { Session } from '../../src/application/types.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import type { SyncReport } from '../../src/data/sync/engine.js';
import type { SyncControl } from '../../src/data/sync/index.js';
import { tempDir } from '../helpers.js';
import { FakeSojaServer } from './fake-soja-server.js';

const SERVER = 'https://soja.test';
let server: FakeSojaServer;
let dir: ReturnType<typeof tempDir>;
const runtimes: AppRuntime[] = [];

interface Client {
  runtime: AppRuntime;
  session: Session;
  chat: ChatOperations;
  sync: SyncControl;
  syncNow(): Promise<SyncReport>;
}

async function client(userId: string, options: { WebSocket?: typeof WebSocket } = {}): Promise<Client> {
  const credentials = new CredentialStore(join(dir.path, `credentials-${userId}-${runtimes.length}.json`));
  credentials.save(SERVER, server.tokenFor(userId), 'x');
  const runtime = await bootstrap({
    paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
    config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, userId } }),
    credentials,
    fetch: server.fetch,
    replicaFile: ':memory:',
    ...options,
  });
  runtimes.push(runtime);
  const session = await runtime.services.session.current();
  const { chat, sync } = runtime.services;
  if (!session || !chat || !sync) throw new Error('remote runtime without chat');
  const c = { runtime, session, chat, sync, syncNow: () => sync.syncNow(session.workspace.id) };
  await c.syncNow();
  return c;
}

const bodies = async (c: Client, channel = 'general') => (await c.chat.messages(c.session, (await c.chat.channel(c.session, channel)).id)).map((m) => m.body);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean> | boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(10);
  }
}

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

describe('chat in remote mode', () => {
  it('queues messages offline, shows them as pending, and delivers them in order', async () => {
    const michael = await client(michaelId);
    const angel = await client(angelId);
    server.online = false;
    await michael.chat.send(michael.session, '#general', 'first');
    await michael.chat.send(michael.session, 'general', 'second @angel');
    const pending = await michael.chat.messages(michael.session, server.general);
    expect(pending.map((m) => [m.body, m.pending, m.seq])).toEqual([
      ['first', true, null],
      ['second @angel', true, null],
    ]);
    expect((await michael.syncNow()).online).toBe(false);

    server.online = true;
    await michael.syncNow();
    expect((await michael.chat.messages(michael.session, server.general)).map((m) => m.pending)).toEqual([false, false]);
    await angel.syncNow();
    expect(await bodies(angel)).toEqual(['first', 'second @angel']);
    expect(await angel.chat.totals(angel.session)).toEqual({ unread: 2, mentions: 1 });
    // Your own messages are never unread.
    expect(await michael.chat.totals(michael.session)).toEqual({ unread: 0, mentions: 0 });
  });

  it('sends a message written while a sync is running right after it, not at the next timer', async () => {
    const michael = await client(michaelId);
    const running = michael.syncNow();
    await michael.chat.send(michael.session, 'general', 'written mid-sync');
    const followUp = michael.syncNow();
    await running;
    await followUp;
    expect([...server.messages.values()].map((m) => m.body)).toEqual(['written mid-sync']);
  });

  it('keeps read marks in step across machines and never moves them back', async () => {
    const michael = await client(michaelId);
    const laptop = await client(angelId);
    const desktop = await client(angelId);
    await michael.chat.send(michael.session, 'general', 'hello');
    await michael.syncNow();
    await laptop.syncNow();
    await desktop.syncNow();
    expect((await desktop.chat.totals(desktop.session)).unread).toBe(1);

    await laptop.chat.markRead(laptop.session, server.general);
    await laptop.chat.markRead(laptop.session, server.general); // nothing new: no second operation
    expect((await laptop.sync.status(laptop.session.workspace.id)).pending).toBe(1);
    await laptop.syncNow();
    await desktop.syncNow();
    expect((await desktop.chat.totals(desktop.session)).unread).toBe(0);
  });

  it('edits and deletes only your own messages, offline too', async () => {
    const michael = await client(michaelId);
    const angel = await client(angelId);
    const sent = await michael.chat.send(michael.session, 'general', 'draft');
    await michael.syncNow();
    await angel.syncNow();
    await expect(angel.chat.edit(angel.session, sent.id, 'hacked')).rejects.toThrow(/own messages/);

    server.online = false;
    await michael.chat.edit(michael.session, sent.id, 'final');
    // A pull while the edit waits must not bring the old text back.
    server.online = true;
    server.opsFailWith = 500;
    await michael.syncNow();
    expect(await bodies(michael)).toEqual(['final']);
    server.opsFailWith = null;
    await michael.syncNow();
    await angel.syncNow();
    const [edited] = await angel.chat.messages(angel.session, server.general);
    expect(edited).toMatchObject({ body: 'final' });
    expect(edited?.editedAt).toBeInstanceOf(Date);

    await michael.chat.remove(michael.session, sent.id);
    await michael.syncNow();
    await angel.syncNow();
    expect((await angel.chat.messages(angel.session, server.general))[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it('gives your text back when the server refuses a message', async () => {
    const archived = server.addChannel('old');
    const michael = await client(michaelId);
    // Archived after this machine last synced, so the client still lets you write.
    const channel = server.channels.get(archived);
    if (channel) channel.archivedAt = new Date().toISOString();
    await michael.chat.send(michael.session, 'old', 'anyone here?');
    const report = await michael.syncNow();
    expect(report.chatRejected).toBe(1);
    expect(await bodies(michael, 'old')).toEqual([]);
    const [notice] = await michael.sync.notices(michael.session.workspace.id);
    expect(notice).toMatchObject({ taskRef: '#old', field: 'chat', overwritten: 'anyone here?' });
    expect(notice?.message).toMatch(/not sent: #old is archived/);
  });

  it('leaves messages the server paces for a later sync, in order', async () => {
    const michael = await client(michaelId);
    for (const n of [1, 2, 3, 4, 5]) await michael.chat.send(michael.session, 'general', `msg ${n}`);
    server.messageLimit = 2;
    const report = await michael.syncNow();
    expect(report.deferred).toBe(3);
    expect(server.messages.size).toBe(2);
    server.messageLimit = null;
    await michael.syncNow();
    const onServer = [...server.messages.values()].sort((a, b) => (a.seq as number) - (b.seq as number)).map((m) => m.body);
    expect(onServer).toEqual(['msg 1', 'msg 2', 'msg 3', 'msg 4', 'msg 5']);
  });

  it('creates a task from a message and replies with its real number, even offline', async () => {
    const michael = await client(michaelId);
    const angel = await client(angelId);
    await angel.chat.send(angel.session, 'general', 'The webhook fails on retries\nsee the logs');
    await angel.syncNow();
    await michael.syncNow();
    const [question] = await michael.chat.messages(michael.session, server.general);
    if (!question) throw new Error('no message');

    server.online = false;
    const task = await michael.chat.taskFromMessage(michael.session, question.id);
    expect(task).toMatchObject({ ref: 'SOJA-?1', title: 'The webhook fails on retries', requester: '@angel' });
    expect(task.description).toBe('@angel in #general:\n> The webhook fails on retries\n> see the logs');
    const reply = (await michael.chat.messages(michael.session, server.general)).at(-1);
    expect(reply).toMatchObject({ body: '→ SOJA-?1 The webhook fails on retries', replyTo: { id: question.id } });

    server.online = true;
    await michael.syncNow();
    const onServer = [...server.messages.values()].find((m) => m.replyToId === question.id);
    expect(onServer?.body).toBe('→ SOJA-1 The webhook fails on retries');
    await angel.syncNow();
    const backlinks = await angel.chat.mentionsOfTask(angel.session, 1);
    expect(backlinks.map((m) => [m.body, m.author?.username])).toEqual([['→ SOJA-1 The webhook fails on retries', 'michael']]);
  });

  it('creates channels online only', async () => {
    const michael = await client(michaelId);
    await michael.chat.createChannel(michael.session, '#Payments');
    expect((await michael.chat.channels(michael.session)).map((c) => c.name)).toEqual(['general', 'payments']);
    await expect(michael.chat.createChannel(michael.session, 'Bad name!')).rejects.toThrow(/lowercase/);
    server.online = false;
    await expect(michael.chat.createChannel(michael.session, 'later')).rejects.toThrow(/needs a connection/);
  });

  it('asks the server for older messages only before the oldest one it has', async () => {
    for (const n of [1, 2, 3]) server.serverMessage(server.general, angelId, `old ${n}`);
    const michael = await client(michaelId);
    // A replica that only kept the newest message.
    const runtimeChat = michael.chat;
    expect((await bodies(michael)).length).toBe(3);
    expect(await runtimeChat.loadOlder(michael.session, server.general)).toBe(0);
  });

  it('receives messages over the live connection without waiting for a sync', async () => {
    const michael = await client(michaelId, { WebSocket: server.WebSocket });
    const reports: SyncReport[] = [];
    michael.sync.subscribe((report) => {
      if (report) reports.push(report);
    });
    const stop = michael.sync.startLive(michael.session.workspace.id);
    await until(() => server.sockets.size === 1);
    const pulls = reports.length;

    server.serverMessage(server.general, angelId, 'hi @michael');
    await until(async () => (await bodies(michael)).includes('hi @michael'));
    expect(reports.some((report) => report.live)).toBe(true);
    expect(await michael.chat.totals(michael.session)).toEqual({ unread: 1, mentions: 1 });

    // Task changes only announce themselves; the client syncs to fetch them.
    const angel = await client(angelId);
    await angel.runtime.services.tasks.create(angel.session, { title: 'Live task' });
    await angel.syncNow();
    await until(async () => (await michael.runtime.services.tasks.list(michael.session, 'all')).some((t) => t.title === 'Live task'));
    expect(reports.length).toBeGreaterThan(pulls);
    stop();
    expect(server.sockets.size).toBe(0);
  });

  it('reconnects after the server drops the connection, but not after a refused token', async () => {
    const michael = await client(michaelId, { WebSocket: server.WebSocket });
    const stop = michael.sync.startLive(michael.session.workspace.id);
    await until(() => server.sockets.size === 1);
    const [socket] = [...server.sockets] as unknown as { drop(): void }[];
    socket?.drop();
    await until(() => server.sockets.size === 1, 3000);
    stop();

    server.users.delete(michaelId);
    const stopRefused = michael.sync.startLive(michael.session.workspace.id);
    await wait(1200);
    expect(server.sockets.size).toBe(0);
    stopRefused();
  });
});

describe('managing channels', () => {
  it('sets topics and archives channels online; #general stays', async () => {
    const michael = await client(michaelId);
    const payments = await michael.chat.createChannel(michael.session, 'payments');
    expect((await michael.chat.updateChannel(michael.session, payments.id, { topic: 'Stripe and PayPal' })).topic).toBe('Stripe and PayPal');
    const archived = await michael.chat.updateChannel(michael.session, payments.id, { archived: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(michael.chat.send(michael.session, 'payments', 'hello?')).rejects.toThrow(/archived/);
    await expect(michael.chat.updateChannel(michael.session, server.general, { archived: true })).rejects.toThrow(/cannot be archived/);
    server.online = false;
    await expect(michael.chat.updateChannel(michael.session, payments.id, { archived: false })).rejects.toThrow(/needs a connection/);
  });
});
