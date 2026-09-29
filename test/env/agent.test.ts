import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppServices } from '../../src/application/services/index.js';
import type { Session } from '../../src/application/types.js';
import { ApiClient } from '../../src/data/remote/api-client.js';
import { RemoteEnvService } from '../../src/data/sync/env.js';
import { EnvAgent } from '../../src/env/agent.js';
import { agentSocketPath } from '../../src/env/agent-socket.js';
import { EnvKeyStore } from '../../src/env/keystore.js';
import { tempDir } from '../helpers.js';
import { FakeEnvServer } from './fake-env-server.js';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli', 'index.tsx');

let dir: ReturnType<typeof tempDir>;
let server: FakeEnvServer;
let agent: EnvAgent | null;
let runtime: string;
let repo: string;
beforeEach(() => {
  dir = tempDir();
  server = new FakeEnvServer();
  agent = null;
  runtime = join(dir.path, 'run');
  repo = join(dir.path, 'enrollbridge');
  mkdirSync(repo);
});
afterEach(() => {
  agent?.close();
  dir.cleanup();
});

const project = { id: randomUUID(), name: 'EnrollBridge', key: 'ENROLL' };

function person(username: string, role: 'owner' | 'member') {
  const { id, token } = server.addUser(username, role);
  const now = new Date();
  const session: Session = {
    user: { id, username, displayName: username, email: null, createdAt: now, updatedAt: now },
    workspace: { id: server.workspaceId, name: 'Bravos', slug: 'bravos', description: null, createdAt: now, updatedAt: now },
  };
  const env = new RemoteEnvService(new ApiClient('https://soja.test', token, server.fetch), new EnvKeyStore(join(dir.path, `${username}.json`)), () => server.now);
  // Only what the agent uses: the session, the project of a folder, and env.
  const services = {
    env,
    session: { current: async () => session },
    projects: { findByRepository: async (_session: Session, cwd: string) => (cwd.startsWith(repo) ? project : null) },
  } as unknown as AppServices;
  return { id, session, env, services };
}

/** Michael owns production (DATABASE_URL) and staging; Angel may use production for 3 days. */
async function team() {
  const michael = person('michael', 'owner');
  const angel = person('angel', 'member');
  await michael.env.setup('michael-laptop');
  await angel.env.setup('angel-laptop');
  const production = await michael.env.createVault(michael.session, project.id, 'production');
  await michael.env.createVault(michael.session, project.id, 'staging');
  await michael.env.setVariable(michael.session, production.id, 'DATABASE_URL', 'postgres://prod');
  await michael.env.grant(michael.session, production.id, angel.id, 3);
  return { michael, angel, production };
}

async function openSoja(services: AppServices, clock?: () => Date) {
  agent = new EnvAgent(services, agentSocketPath({ XDG_RUNTIME_DIR: runtime }), clock);
  expect(await agent.start()).toBe('started');
  return agent;
}

/** `soja run …` as the developer types it, from `cwd`. */
function sojaRun(args: string[], cwd = repo) {
  const child = spawn(TSX, [CLI, 'run', ...args], { cwd, env: { ...process.env, XDG_RUNTIME_DIR: runtime, NO_COLOR: '1' } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const done = new Promise<{ code: number | null }>((resolve) => child.once('exit', (code) => resolve({ code })));
  const waitFor = async (text: string, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!stdout.includes(text) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (!stdout.includes(text)) throw new Error(`"${text}" never appeared. stdout: ${stdout} stderr: ${stderr}`);
  };
  return { child, done, waitFor, out: () => stdout, err: () => stderr };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A program that starts a grandchild, prints both pids and keeps running. */
const LONG_RUNNING = "const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('ready',process.pid,g.pid);setInterval(()=>{},1000)";

describe('soja run', () => {
  it('runs the command with the variables of the folder’s project, only while SOJA is open', async () => {
    const { angel } = await team();
    const closed = sojaRun(['--', process.execPath, '-e', 'console.log(process.env.DATABASE_URL)']);
    expect((await closed.done).code).not.toBe(0);
    expect(closed.err()).toContain('SOJA is not open');

    await openSoja(angel.services);
    const run = sojaRun(['--', process.execPath, '-e', 'console.log(process.env.DATABASE_URL)']);
    expect((await run.done).code).toBe(0);
    expect(run.out().trim()).toBe('postgres://prod');
    expect(run.err()).toContain('EnrollBridge · production · 1 variable');
  }, 60_000);

  it('explains an unlinked folder and an environment without access, and starts nothing', async () => {
    const { angel } = await team();
    await openSoja(angel.services);
    const elsewhere = sojaRun(['--', process.execPath, '-e', 'console.log("started")'], dir.path);
    expect((await elsewhere.done).code).not.toBe(0);
    expect(elsewhere.err()).toContain('not linked to a SOJA project');
    const staging = sojaRun(['-e', 'staging', '--', process.execPath, '-e', 'console.log("started")']);
    expect((await staging.done).code).not.toBe(0);
    expect(staging.err()).toContain('no current access to EnrollBridge staging');
    expect(staging.err()).toContain('You can use: production');
    expect(staging.out()).not.toContain('started');
  }, 60_000);

  it('closing SOJA stops the command and everything it started', async () => {
    const { angel } = await team();
    const open = await openSoja(angel.services);
    const run = sojaRun(['--', process.execPath, '-e', LONG_RUNNING]);
    await run.waitFor('ready');
    const [, pid, grandchild] = run.out().trim().split(/\s+/).map(Number);
    expect(open.runs()).toHaveLength(1);
    open.close();
    agent = null;
    await run.done;
    expect(run.err()).toContain('Stopping: SOJA was closed');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(alive(pid ?? 0)).toBe(false);
    expect(alive(grandchild ?? 0)).toBe(false);
  }, 60_000);

  it('a revoked access stops the command at the next check', async () => {
    const { michael, angel, production } = await team();
    const open = await openSoja(angel.services);
    const run = sojaRun(['--', process.execPath, '-e', LONG_RUNNING]);
    await run.waitFor('ready');
    await michael.env.revoke(michael.session, production.id, angel.id);
    await open.recheck();
    await run.done;
    expect(run.err()).toContain('your access to these variables was revoked');
  }, 60_000);

  it('an expired access stops the command on time, without asking the server', async () => {
    const { angel } = await team();
    // The grant ends three days after server.now; start this clock 300 ms before that.
    const expiresAt = server.now.getTime() + 3 * 86_400_000;
    const started = Date.now();
    await openSoja(angel.services, () => new Date(expiresAt - 300 + (Date.now() - started)));
    const run = sojaRun(['--', process.execPath, '-e', LONG_RUNNING]);
    await run.done;
    expect(run.err()).toContain('your access to these variables expired');
  }, 60_000);

  it('refuses to hand over a name that loads code, even if an owner signed it', async () => {
    const { michael, angel, production } = await team();
    await michael.env.setVariable(michael.session, production.id, 'NODE_OPTIONS', '--require /tmp/evil.js');
    await openSoja(angel.services);
    const run = sojaRun(['--', process.execPath, '-e', 'console.log("started")']);
    expect((await run.done).code).not.toBe(0);
    expect(run.err()).toContain('NODE_OPTIONS is not allowed');
    expect(run.out()).not.toContain('started');
  }, 60_000);

  it('listens on a socket only this user can open', async () => {
    const { angel } = await team();
    await openSoja(angel.services);
    const socket = agentSocketPath({ XDG_RUNTIME_DIR: runtime });
    expect(statSync(dirname(socket)).mode & 0o777).toBe(0o700);
    expect(statSync(socket).mode & 0o777).toBe(0o600);
    // A second SOJA leaves the first one serving.
    const second = new EnvAgent(angel.services, socket);
    expect(await second.start()).toBe('already-running');
  }, 60_000);
});
