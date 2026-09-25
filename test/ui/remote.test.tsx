import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { App } from '../../src/ui/App.js';
import { FakeSojaServer } from '../data/fake-soja-server.js';
import { tempDir } from '../helpers.js';

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

let runtime: AppRuntime | undefined;
let ui: ReturnType<typeof render> | undefined;
let dir: ReturnType<typeof tempDir>;
afterEach(() => {
  ui?.unmount();
  runtime?.close();
  dir.cleanup();
});

describe('remote mode in the interface', () => {
  it('shows the real number as soon as a new task is synced, without reopening SOJA', async () => {
    dir = tempDir();
    const server = new FakeSojaServer();
    const userId = server.addUser('michael');
    const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
    credentials.save('https://soja.test', server.tokenFor(userId), 'michael');
    runtime = await bootstrap({
      paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
      config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: 'https://soja.test', userId } }),
      credentials,
      fetch: server.fetch,
      replicaFile: ':memory:',
      WebSocket: server.WebSocket,
    });

    ui = render(<App services={runtime.services} splashMs={0} cwd={dir.path} />);
    await settle(300);
    ui.stdin.write('n');
    await settle();
    for (const char of 'Created in the TUI') {
      ui.stdin.write(char);
      await settle(10);
    }
    ui.stdin.write('\r');
    await settle(80);
    expect(ui.lastFrame()).toContain('SOJA-?1');

    // The change is pushed shortly after (debounced); the list must follow on its own.
    await settle(1500);
    const frame = ui.lastFrame() ?? '';
    expect(frame).toContain('SOJA-1');
    expect(frame).not.toContain('SOJA-?1');
    expect(server.tasks.size).toBe(1);
  });

  it('chats in real time: unread badge, send, live messages, replies and tasks from messages', async () => {
    dir = tempDir();
    const server = new FakeSojaServer();
    const userId = server.addUser('michael');
    const angelId = server.addUser('angel');
    server.serverMessage(server.general, angelId, 'hi @michael, SOJA-1 is flaky');
    const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
    credentials.save('https://soja.test', server.tokenFor(userId), 'michael');
    runtime = await bootstrap({
      paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
      config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: 'https://soja.test', userId } }),
      credentials,
      fetch: server.fetch,
      replicaFile: ':memory:',
      WebSocket: server.WebSocket,
    });
    const type = async (text: string) => {
      for (const char of text) {
        ui?.stdin.write(char);
        await settle(5);
      }
    };

    ui = render(<App services={runtime.services} splashMs={0} cwd={dir.path} />);
    await settle(400);
    expect(ui.lastFrame()).toContain('✉ 1 @1');

    ui.stdin.write('#');
    await settle(150);
    expect(ui.lastFrame()).toContain('#general');
    expect(ui.lastFrame()).toContain('hi @michael, SOJA-1 is flaky');

    await type('on it');
    ui.stdin.write('\r');
    await settle(80);
    expect(ui.lastFrame()).toContain('on it');
    await settle(1200);
    expect([...server.messages.values()].map((m) => m.body)).toContain('on it');
    expect(server.reads.get(userId)?.get(server.general)).toBeGreaterThan(0);

    // Someone else writes: it arrives over the live connection.
    server.serverMessage(server.general, angelId, 'thanks!');
    await settle(150);
    expect(ui.lastFrame()).toContain('thanks!');

    // tab → messages; k up to angel's first message; r replies to it.
    ui.stdin.write('\t');
    await settle(40);
    ui.stdin.write('k');
    await settle(40);
    ui.stdin.write('k');
    await settle(40);
    ui.stdin.write('r');
    await settle(60);
    expect(ui.lastFrame()).toContain('Replying to @angel');
    await type('looking');
    ui.stdin.write('\r');
    await settle(1200);
    const first = [...server.messages.values()].find((m) => String(m.body).startsWith('hi @michael'));
    const reply = [...server.messages.values()].find((m) => m.body === 'looking');
    expect(reply?.replyToId).toBe(first?.id);

    // A task from the same message, with the reply naming its real number.
    ui.stdin.write('\t');
    await settle(40);
    for (const _ of [1, 2, 3, 4]) {
      ui.stdin.write('k');
      await settle(30);
    }
    ui.stdin.write('t');
    await settle(100);
    expect(ui.lastFrame()).toContain('Created SOJA-?1 from the message');
    await settle(1500);
    expect([...server.tasks.values()].map((task) => task.title)).toEqual(['hi @michael, SOJA-1 is flaky']);
    expect([...server.messages.values()].map((m) => m.body)).toContain('→ SOJA-1 hi @michael, SOJA-1 is flaky');
    }, 20_000);
});
