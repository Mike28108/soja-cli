/**
 * Two developers, a real soja-backend (its test/e2e/server.ts, with GitHub
 * login stubbed) and a real PostgreSQL, driving the real CLI.
 *
 *   SOJA_BACKEND_DIR=../../services/soja-backend DATABASE_URL=postgres://…@localhost/… npm run test:e2e
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrap } from '../../src/bootstrap.js';
import { resolvePaths } from '../../src/config/paths.js';
import { EnvAgent } from '../../src/env/agent.js';
import { agentSocketPath } from '../../src/env/agent-socket.js';

const BACKEND = resolvePath(process.env.SOJA_BACKEND_DIR ?? '../../services/soja-backend');
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PORT = Number(process.env.SOJA_E2E_PORT ?? 18799);
const SERVER = `http://localhost:${PORT}`;
const CLI = resolvePath('src/cli/index.tsx');
const TSX_LOADER = pathToFileURL(resolvePath('node_modules/tsx/dist/loader.mjs')).href;
const home = mkdtempSync(join(tmpdir(), 'soja-e2e-'));
let server: ChildProcess | null = null;

async function startServer(): Promise<void> {
  // Its own process group, so stopping it also stops the processes tsx starts.
  server = spawn(process.execPath, ['--import', 'tsx', 'test/e2e/server.ts'], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL, PORT: String(PORT) },
    stdio: 'ignore',
    detached: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await fetch(`${SERVER}/v1/health`).then((response) => response.ok, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The E2E server did not start.');
}

async function stopServer(): Promise<void> {
  const running = server;
  server = null;
  if (!running?.pid) return;
  const exited = new Promise<void>((resolve) => running.once('exit', () => resolve()));
  process.kill(-running.pid, 'SIGTERM');
  await exited;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!(await fetch(`${SERVER}/v1/health`).then(() => true, () => false))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // The offline part of the test means nothing if the server is still answering.
  throw new Error('The E2E server is still running after being stopped.');
}

/** A developer's environment: their own home, config, replica and agent socket. */
function envOf(who: string): NodeJS.ProcessEnv {
  const dir = join(home, who);
  return { ...process.env, HOME: dir, XDG_DATA_HOME: join(dir, 'data'), XDG_CONFIG_HOME: join(dir, 'config'), XDG_RUNTIME_DIR: join(dir, 'run'), NO_COLOR: '1', TSX_TSCONFIG_PATH: resolvePath('tsconfig.json') };
}

/** Runs `soja …` as a developer; `input` is piped to stdin (secrets are never arguments). */
function sojaIn(who: string, options: { input?: string; cwd?: string }, ...args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // tsx by absolute path: the command may run from a folder outside this project.
    const child = spawn(process.execPath, ['--import', TSX_LOADER, CLI, ...args], {
      env: envOf(who),
      cwd: options.cwd ?? process.cwd(),
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (options.input !== undefined) child.stdin?.end(options.input);
    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

const soja = (who: string, ...args: string[]) => sojaIn(who, {}, ...args);

async function login(who: string): Promise<void> {
  await fetch(`${SERVER}/__next?login=${who}`);
  const result = await soja(who, 'login', '--server', SERVER);
  expect(result.out).toContain(`Signed in as @${who}`);
}

beforeAll(async () => {
  if (!DATABASE_URL) throw new Error('Set DATABASE_URL to a local, empty PostgreSQL database.');
  await startServer();
});
afterAll(async () => {
  await stopServer();
  rmSync(home, { recursive: true, force: true });
});

describe('a team on a real server', () => {
  it('imports local history, then works together online and offline', async () => {
    // Michael used SOJA locally before the team had a server.
    expect((await soja('michael', 'dev', 'seed')).code).toBe(0);
    await login('michael');
    await login('angel');
    expect((await soja('michael', 'workspace', 'create', 'Bravos')).out).toContain('Created Bravos');
    expect((await soja('michael', 'workspace', 'add', 'angel')).out).toContain('@angel joined');
    expect((await soja('angel', 'use', 'bravos')).out).toContain('Now in Bravos');

    const imported = await soja('michael', 'import-local', '--yes');
    expect(imported.out).toMatch(/Imported \d+ tasks/);
    expect((await soja('angel', 'task', 'list', '-A')).out).toContain('Fix Stripe webhook');

    // Offline on both sides, then everyone converges with unique numbers.
    await stopServer();
    expect((await soja('michael', 'task', 'create', 'Written offline by Michael')).out).toContain('SOJA-?1');
    expect((await soja('angel', 'task', 'create', 'Written offline by Angel')).out).toContain('SOJA-?1');
    expect((await soja('michael', 'chat', 'send', 'general', 'sent while offline')).out).toContain('Sent to #general');
    await startServer();
    await soja('michael', 'sync');
    await soja('angel', 'sync');
    await soja('michael', 'sync');
    const [michaelList, angelList] = await Promise.all([soja('michael', 'task', 'list', '-A'), soja('angel', 'task', 'list', '-A')]);
    for (const list of [michaelList.out, angelList.out]) {
      expect(list).toContain('Written offline by Michael');
      expect(list).toContain('Written offline by Angel');
      expect(list).not.toContain('SOJA-?');
    }
    expect((await soja('angel', 'chat', 'log', 'general')).out).toContain('sent while offline');

    // Archive and delete reach the other developer.
    const ref = /SOJA-\d+(?=\s+\S+\s+\S+\s+\S+.*Written offline by Michael)/.exec(michaelList.out)?.[0] ?? '';
    expect(ref).toMatch(/SOJA-\d+/);
    await soja('michael', 'task', 'archive', ref);
    await soja('angel', 'sync');
    expect((await soja('angel', 'task', 'list', '-A')).out).not.toContain('Written offline by Michael');
    expect((await soja('michael', 'task', 'delete', ref, '--yes')).out).toContain('deleted');
    await soja('angel', 'sync');
    expect((await soja('angel', 'task', 'list', '--archived')).out).not.toContain('Written offline by Michael');
  });
});

describe('shared environment variables on a real server', () => {
  it('an owner shares production for 3 days; the developer runs with it only while SOJA is open; revoking ends it', async () => {
    await login('laura');
    await login('bruno');
    expect((await soja('laura', 'workspace', 'create', 'Secrets')).out).toContain('Created Secrets');
    expect((await soja('laura', 'workspace', 'add', 'bruno')).out).toContain('@bruno joined');
    expect((await soja('bruno', 'use', 'secrets')).out).toContain('Now in Secrets');
    expect((await soja('laura', 'project', 'create', 'Enroll', '--key', 'ENR')).code).toBe(0);
    await soja('bruno', 'sync');

    expect((await soja('laura', 'env', 'setup', '--label', 'laura-laptop')).out).toContain('Fingerprint');
    expect((await soja('bruno', 'env', 'setup', '--label', 'bruno-laptop')).out).toContain('Fingerprint');
    expect((await soja('laura', 'env', 'create', '-p', 'ENR', '-e', 'production')).out).toContain('now has production variables');
    expect((await soja('laura', 'env', 'set', 'DATABASE_URL', 'postgres://secret-value', '-p', 'ENR', '-e', 'production')).out).toContain('never taken as arguments');
    expect((await sojaIn('laura', { input: 'postgres://secret-value\n' }, 'env', 'set', 'DATABASE_URL', '-p', 'ENR', '-e', 'production')).out).toContain('DATABASE_URL saved');
    expect((await soja('bruno', 'env', 'ls')).out).toContain('no access');
    expect((await soja('laura', 'env', 'grant', '@bruno', '-p', 'ENR', '-e', 'production', '--days', '3')).out).toContain('@bruno can use Enroll production until');
    expect((await soja('bruno', 'env', 'ls', '-p', 'ENR', '-e', 'production')).out).toContain('DATABASE_URL');

    // Bruno's repository, linked to the project on his machine only.
    const repo = join(home, 'bruno', 'enroll');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    expect((await soja('bruno', 'project', 'link', 'ENR', repo)).code).toBe(0);

    const run = () => sojaIn('bruno', { cwd: repo }, 'run', '--', process.execPath, '-e', 'console.log("value=" + process.env.DATABASE_URL)');
    expect((await run()).out).toContain('SOJA is not open');

    // Bruno opens SOJA: its agent serves `soja run` in his repository.
    const env = envOf('bruno');
    const paths = resolvePaths({ XDG_DATA_HOME: env.XDG_DATA_HOME, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME }, env.HOME);
    const runtime = await bootstrap({ paths });
    const agent = new EnvAgent(runtime.services, agentSocketPath({ XDG_RUNTIME_DIR: env.XDG_RUNTIME_DIR }));
    try {
      expect(await agent.start()).toBe('started');
      const used = await run();
      expect(used.out).toContain('value=postgres://secret-value');
      expect(used.out).toContain('Enroll · production · 1 variable');

      // The server never had the value in clear text.
      const dump = execFileSync('psql', [DATABASE_URL, '-At', '-c', 'select ciphertext from env_variables'], { encoding: 'utf8' });
      expect(dump).not.toContain('secret-value');

      // A second repository with its own production variables; its value wins in its folder.
      const lauraApi = join(home, 'laura', 'api');
      const brunoApi = join(home, 'bruno', 'api');
      for (const folder of [lauraApi, brunoApi]) {
        mkdirSync(folder, { recursive: true });
        execFileSync('git', ['init', '-q'], { cwd: folder });
      }
      expect((await soja('laura', 'project', 'repo', 'add', 'ENR', 'api', lauraApi)).code).toBe(0);
      await soja('bruno', 'sync');
      expect((await soja('bruno', 'project', 'repo', 'link', 'ENR', 'api', brunoApi)).code).toBe(0);
      expect((await soja('laura', 'env', 'create', '-p', 'ENR', '-r', 'api', '-e', 'production')).out).toContain('Enroll/api now has production variables');
      expect((await sojaIn('laura', { input: 'postgres://api-value' }, 'env', 'set', 'DATABASE_URL', '-p', 'ENR', '-r', 'api', '-e', 'production')).out).toContain('DATABASE_URL saved');
      expect((await soja('laura', 'env', 'grant', '@bruno', '-p', 'ENR', '-r', 'api', '-e', 'production', '--days', '3')).out).toContain('@bruno can use Enroll/api production');
      const inApi = await sojaIn('bruno', { cwd: brunoApi }, 'run', '--', process.execPath, '-e', 'console.log("value=" + process.env.DATABASE_URL)');
      expect(inApi.out).toContain('value=postgres://api-value');
      expect(inApi.out).toContain('Enroll/api · production');
      expect((await run()).out).toContain('value=postgres://secret-value');

      const revoked = await soja('laura', 'env', 'revoke', '@bruno', '-p', 'ENR', '-e', 'production');
      expect(revoked.out).toContain('the key was rotated (v2)');
      expect(revoked.out).toContain('DATABASE_URL');
      expect((await run()).out).toContain('no access to Enroll variables');
    } finally {
      agent.close();
      runtime.close();
    }
  });
});
