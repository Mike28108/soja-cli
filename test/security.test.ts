import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryConfigStore } from '../src/config/config.js';
import { CredentialStore } from '../src/config/credentials.js';
import { bootstrap, type AppRuntime } from '../src/bootstrap.js';
import { ApiClient } from '../src/data/remote/api-client.js';
import { CliGit } from '../src/git/cli-git.js';
import { GitConsole } from '../src/git/console.js';
import { diagnose } from '../src/git/diagnose.js';
import { terminalSafe } from '../src/utils/text.js';
import { FakeSojaServer } from './data/fake-soja-server.js';
import { commitFile, createRepo, tempDir } from './helpers.js';

/** Escape sequences a malicious teammate could hide in text. */
const HOSTILE = [
  '\u001b[2J', // clear screen
  '\u001b]0;pwned\u0007', // window title
  '\u001b]52;c;cm0gLXJmIH4=\u0007', // OSC 52: write to the clipboard
  '\u001b[31m', // colors to fake SOJA's own output
  '\u009b2J', // C1 CSI
  '‮', // bidi override (Trojan Source)
];
// eslint-disable-next-line no-control-regex -- detecting control characters is the point
const hasControl = (text: string) => /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/.test(text);

describe('terminalSafe', () => {
  it('removes every control and bidi character but keeps newlines, tabs and ordinary Unicode', () => {
    for (const attack of HOSTILE) expect(hasControl(terminalSafe(`Fix ${attack}bug`))).toBe(false);
    expect(terminalSafe('line 1\r\nline 2\tcol · ñ 🚀 SOJA-12')).toBe('line 1\nline 2\tcol · ñ 🚀 SOJA-12');
  });
});

describe('remote text', () => {
  let dir: ReturnType<typeof tempDir>;
  let runtime: AppRuntime | undefined;
  beforeEach(() => {
    dir = tempDir();
  });
  afterEach(() => {
    runtime?.close();
    dir.cleanup();
  });

  it('cleans every string that comes from a SOJA server, keeping dates as dates', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ title: `Pay${HOSTILE.join('')}ments`, nested: [{ body: `a\u001b[2Jb` }], createdAt: '2026-09-24T10:00:00.000Z' }))) as typeof fetch;
    const data = await new ApiClient('https://soja.test', null, fetcher).get<{ title: string; nested: { body: string }[]; createdAt: Date }>('/x');
    expect(hasControl(JSON.stringify(data.title)) || hasControl(data.title)).toBe(false);
    expect(data.title).toContain('Pay');
    expect(data.nested[0]?.body).toBe('a[2Jb');
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it('never stores a hostile task title from a teammate in the replica', async () => {
    const server = new FakeSojaServer();
    const me = server.addUser('michael');
    const angel = server.addUser('angel');
    const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
    credentials.save('https://soja.test', server.tokenFor(me), 'michael');
    runtime = await bootstrap({
      paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
      config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: 'https://soja.test', userId: me } }),
      credentials,
      fetch: server.fetch,
      replicaFile: ':memory:',
    });
    const session = await runtime.services.session.current();
    if (!session) throw new Error('no session');
    await runtime.services.tasks.create(session, { title: 'Innocent' });
    await runtime.services.sync?.syncNow(session.workspace.id);
    const [stored] = [...server.tasks.values()];
    server.serverChange(String(stored?.id), { title: `Innocent\u001b]52;c;cm0gLXJmIH4=\u0007\u001b[2J` }, angel);
    await runtime.services.sync?.syncNow(session.workspace.id);

    const task = await runtime.services.tasks.get(session, 'SOJA-1');
    expect(hasControl(task.title)).toBe(false);
    expect(task.timeline.every((entry) => (entry.kind === 'event' ? !hasControl(entry.text) : !hasControl(entry.body)))).toBe(true);
  });
});

describe('git text from other people', () => {
  let dir: ReturnType<typeof tempDir>;
  afterEach(() => dir.cleanup());

  it('cleans commit subjects and authors, the live console and error messages', async () => {
    dir = tempDir();
    const repo = createRepo(realpathSync(dir.path));
    commitFile(repo, 'x.txt', 'x', `Harmless\u001b]52;c;ZXZpbA==\u0007 fix`);
    const console = new GitConsole();
    const git = new CliGit(console);
    const [commit] = await git.commitsMatching(repo, 'Harmless', 5);
    expect(commit?.subject).toBe('Harmless]52;c;ZXZpbA== fix');

    console.write('stderr', `remote: \u001b[2Jhello`);
    expect(console.since().map((line) => line.text)).toEqual(['remote: [2Jhello']);
    expect(hasControl(diagnose(`fatal: \u001b[31mboom`, 'Could not push.').message)).toBe(false);
  });
});
