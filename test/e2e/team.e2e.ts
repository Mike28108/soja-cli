/**
 * Two developers, a real soja-backend (its test/e2e/server.ts, with GitHub
 * login stubbed) and a real PostgreSQL, driving the real CLI.
 *
 *   SOJA_BACKEND_DIR=../../services/soja-backend DATABASE_URL=postgres://…@localhost/… npm run test:e2e
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BACKEND = resolvePath(process.env.SOJA_BACKEND_DIR ?? '../../services/soja-backend');
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PORT = Number(process.env.SOJA_E2E_PORT ?? 18799);
const SERVER = `http://localhost:${PORT}`;
const CLI = resolvePath('src/cli/index.tsx');
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

/** Runs `soja …` as a developer with their own home, config and replica. */
function soja(who: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const dir = join(home, who);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CLI, ...args], {
      env: { ...process.env, HOME: dir, XDG_DATA_HOME: join(dir, 'data'), XDG_CONFIG_HOME: join(dir, 'config'), NO_COLOR: '1', TSX_TSCONFIG_PATH: resolvePath('tsconfig.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

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
