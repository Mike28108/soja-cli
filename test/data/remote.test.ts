import { realpathSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { NotFoundError, SojaError, ValidationError } from '../../src/domain/errors.js';
import { createRepo, git, tempDir } from '../helpers.js';

const SERVER = 'https://soja.test';
const now = '2026-09-24T12:00:00.000Z';
const user = { id: 'u1', username: 'angel', displayName: 'Angel', email: null, createdAt: now, updatedAt: now };
const workspace = { id: 'w1', name: 'Bravos', slug: 'bravos', description: null, createdAt: now, updatedAt: now, role: 'member' };
const project = { id: 'p1', workspaceId: 'w1', name: 'EnrollBridge', key: 'ENROLL', description: null, repositoryUrl: null, createdAt: now, updatedAt: now };
const task = {
  id: 't1', number: 12, ref: 'SOJA-12', workspaceId: 'w1', projectId: 'p1', title: 'Fix webhook', description: null, type: 'bug',
  priority: 'high', status: 'todo', assigneeId: 'u1', creatorId: 'u1', requester: null, branch: null, baseBranch: null,
  branchStart: null, createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
  project: { id: 'p1', name: 'EnrollBridge', key: 'ENROLL' }, assignee: { id: 'u1', username: 'angel', displayName: 'Angel' },
};

interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}

/** A scripted SOJA server: route → response, recording every request. */
function fakeServer(routes: Record<string, (body: unknown) => { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: `${url.pathname}${url.search}`, body, auth: headers.get('Authorization') });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ error: { code: 'not_found', message: `No route ${url.pathname}` } }), { status: 404 });
    const result = route(body);
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), { status: result.status ?? 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

let dir: ReturnType<typeof tempDir>;
let runtime: AppRuntime;
let config: MemoryConfigStore;

async function start(routes: Parameters<typeof fakeServer>[0]) {
  const server = fakeServer({ 'GET /v1/me': () => ({ body: { user, workspaces: [workspace] } }), ...routes });
  config = new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, repositoryPaths: {} } });
  const credentials = new CredentialStore(`${dir.path}/credentials.json`);
  credentials.save(SERVER, 'soja_test_token_1234567890abcdef', 'angel');
  runtime = await bootstrap({
    paths: { dataDir: '', configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
    config,
    credentials,
    fetch: server.fetcher,
  });
  return server;
}

beforeEach(() => {
  dir = tempDir();
});
afterEach(() => {
  runtime?.close();
  dir.cleanup();
});

describe('remote mode', () => {
  it('uses the server for the session, remembers the workspace and sends the token', async () => {
    const server = await start({});
    const session = await runtime.services.session.current();
    expect(session?.workspace.name).toBe('Bravos');
    expect(session?.user.createdAt).toBeInstanceOf(Date);
    expect(config.load()?.remote?.workspaceId).toBe('w1');
    expect(server.calls[0]?.auth).toBe('Bearer soja_test_token_1234567890abcdef');
    expect(runtime.services.environment).toEqual({ mode: 'remote', server: SERVER });
  });

  it('refuses to start without a token for the configured server', async () => {
    const credentials = new CredentialStore(`${dir.path}/empty.json`);
    const store = new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, repositoryPaths: {} } });
    await expect(
      bootstrap({ paths: { dataDir: '', configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' }, config: store, credentials }),
    ).rejects.toThrow(`Not signed in to ${SERVER}.`);
  });

  it('addresses tasks by number and builds the timeline locally', async () => {
    const server = await start({
      'GET /v1/workspaces/w1/tasks/SOJA-12': () => ({
        body: {
          task,
          creator: task.assignee,
          activity: [{ id: 'a1', taskId: 't1', userId: 'u1', type: 'task_created', metadata: {}, createdAt: now }],
          comments: [{ id: 'c1', taskId: 't1', userId: 'u1', body: 'On it', createdAt: now, updatedAt: now }],
          users: [task.assignee],
          projects: [task.project],
        },
      }),
      'POST /v1/workspaces/w1/tasks/SOJA-12/changes': (body) => ({ body: { ...task, ...(body as object) } }),
    });
    const session = await runtime.services.session.current();
    if (!session) throw new Error('no session');

    const details = await runtime.services.tasks.get(session, 'soja-12');
    expect(details.timeline.map((entry) => (entry.kind === 'event' ? entry.text : entry.body))).toEqual(['created the task', 'On it']);
    expect(details.suggestedBranch).toBe('fix/SOJA-12-fix-webhook');
    expect(details.createdAt).toBeInstanceOf(Date);

    await runtime.services.tasks.update(session, details, { priority: 'urgent' });
    expect(server.calls.at(-1)).toMatchObject({ method: 'POST', path: '/v1/workspaces/w1/tasks/SOJA-12/changes', body: { priority: 'urgent' } });
  });

  it('turns server errors into the same errors local mode throws', async () => {
    await start({
      'GET /v1/workspaces/w1/tasks': () => ({ status: 400, body: { error: { code: 'invalid_input', message: 'Unknown filter.' } } }),
      'POST /v1/workspaces/w1/tasks': () => ({ status: 401, body: { error: { code: 'invalid_token', message: 'Your session expired or was revoked.', hint: 'Run `soja login`.' } } }),
    });
    const session = await runtime.services.session.current();
    if (!session) throw new Error('no session');
    await expect(runtime.services.tasks.list(session, 'mine')).rejects.toBeInstanceOf(ValidationError);
    await expect(runtime.services.tasks.get(session, 'SOJA-99')).rejects.toBeInstanceOf(NotFoundError);
    await expect(runtime.services.tasks.create(session, { title: 'x' })).rejects.toMatchObject({ hint: 'Run `soja login`.' });
  });

  it('explains an unreachable server', async () => {
    config = new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: SERVER, repositoryPaths: {} } });
    const credentials = new CredentialStore(`${dir.path}/c.json`);
    credentials.save(SERVER, 'soja_test_token_1234567890abcdef', 'angel');
    runtime = await bootstrap({
      paths: { dataDir: '', configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
      config,
      credentials,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    const failure = await runtime.services.session.current().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SojaError);
    expect(failure).toMatchObject({ message: `Could not reach the SOJA server at ${SERVER}.` });
  });

  it('keeps repository paths on this machine and shares only the origin URL', async () => {
    const server = await start({
      'GET /v1/workspaces/w1/projects': () => ({ body: [{ ...project, counts: {}, active: 0 }] }),
      'PATCH /v1/workspaces/w1/projects/p1': (body) => ({ body: { ...project, ...(body as object) } }),
    });
    const session = await runtime.services.session.current();
    if (!session) throw new Error('no session');
    const repo = createRepo(realpathSync(dir.path));
    git(repo, 'remote', 'add', 'origin', 'git@github.com:bravos/enrollbridge.git');

    const [listed] = await runtime.services.projects.list(session);
    if (!listed) throw new Error('no project');
    const linked = await runtime.services.projects.linkRepository(session, listed, repo);
    expect(linked).toMatchObject({ repositoryPath: repo, repositoryUrl: 'git@github.com:bravos/enrollbridge.git' });
    expect(config.load()?.remote?.repositoryPaths).toEqual({ p1: repo });
    const patch = server.calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ repositoryUrl: 'git@github.com:bravos/enrollbridge.git' });
    expect(JSON.stringify(server.calls)).not.toContain(repo);

    expect((await runtime.services.projects.findByRepository(session, repo))?.id).toBe('p1');
    await runtime.services.projects.unlinkRepository(session, linked);
    expect(config.load()?.remote?.repositoryPaths).toEqual({});
  });
});

describe('credentials', () => {
  it('stores tokens per server with owner-only permissions', async () => {
    const file = `${dir.path}/credentials.json`;
    const store = new CredentialStore(file);
    store.save(`${SERVER}/`, 'soja_abc', 'angel');
    expect(store.token(SERVER)).toBe('soja_abc');
    const { statSync } = await import('node:fs');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    store.remove(SERVER);
    expect(store.token(SERVER)).toBeNull();
  });
});
