import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import type { Project } from '../../src/domain/entities.js';
import { CliGit } from '../../src/git/cli-git.js';
import { GitError } from '../../src/git/types.js';
import { commitFile, createRepo, createSetUpApp, git, tempDir, type TestApp } from '../helpers.js';

let app: TestApp & { session: Session };
let dir: ReturnType<typeof tempDir>;
let repo: string;
let project: Project;

beforeEach(async () => {
  dir = tempDir();
  repo = createRepo(realpathSync(dir.path));
  app = await createSetUpApp();
  project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
});
afterEach(() => {
  app.close();
  dir.cleanup();
});

const outside = () => {
  const path = join(realpathSync(dir.path), '..', `not-a-repo-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path);
  return path;
};

describe('linking projects to repositories', () => {
  it('stores the repository root even when linked from a subdirectory, and picks up origin', async () => {
    mkdirSync(join(repo, 'src'));
    git(repo, 'remote', 'add', 'origin', 'git@github.com:bravos/enrollbridge.git');
    const linked = await app.services.projects.linkRepository(app.session, project, join(repo, 'src'));
    expect(linked.repositoryPath).toBe(repo);
    expect(linked.repositoryUrl).toBe('git@github.com:bravos/enrollbridge.git');
    expect((await app.services.projects.findByRepository(app.session, join(repo, 'src')))?.id).toBe(project.id);
  });

  it('refuses paths that are missing or not repositories', async () => {
    await expect(app.services.projects.linkRepository(app.session, project, '/definitely/missing')).rejects.toThrow(
      /does not exist/,
    );
    const plain = outside();
    try {
      await expect(app.services.projects.linkRepository(app.session, project, plain)).rejects.toThrow(
        /not inside a Git repository/,
      );
      expect(await app.services.projects.findByRepository(app.session, plain)).toBeNull();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('unlinks', async () => {
    await app.services.projects.linkRepository(app.session, project, repo);
    const unlinked = await app.services.projects.unlinkRepository(app.session, project);
    expect(unlinked.repositoryPath).toBeNull();
  });
});

describe('soja start', () => {
  beforeEach(async () => {
    await app.services.projects.linkRepository(app.session, project, repo);
    await app.services.tasks.create(app.session, {
      title: 'Fix Stripe webhook duplicates',
      type: 'bug',
      projectId: project.id,
      assigneeId: null,
    });
  });

  it('creates the branch from HEAD, then assigns, starts and records it', async () => {
    const result = await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' });
    expect(result).toMatchObject({ action: 'created', base: 'main', branch: 'fix/SOJA-1-fix-stripe-webhook-duplicates', root: repo });
    expect(git(repo, 'branch', '--show-current')).toBe('fix/SOJA-1-fix-stripe-webhook-duplicates');
    expect(result.task).toMatchObject({ status: 'in_progress', assigneeId: app.session.user.id, branch: result.branch });

    const { timeline } = await app.services.tasks.get(app.session, 'SOJA-1');
    expect(timeline.map((entry) => (entry.kind === 'event' ? entry.text : ''))).toContain(
      'linked branch fix/SOJA-1-fix-stripe-webhook-duplicates',
    );
  });

  it('is idempotent and switches back to an existing branch', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' });
    expect((await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).action).toBe('current');
    git(repo, 'switch', '--quiet', 'main');
    expect((await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).action).toBe('switched');
    expect(git(repo, 'branch', '--show-current')).toBe('fix/SOJA-1-fix-stripe-webhook-duplicates');
  });

  it('creates from --from and carries uncommitted work into a new branch', async () => {
    git(repo, 'switch', '--quiet', '-c', 'develop');
    commitFile(repo, 'dev.txt', 'dev', 'Develop work');
    writeFileSync(join(repo, 'wip.txt'), 'work in progress');
    const result = await app.services.git.start(app.session, 'SOJA-1', { cwd: '/', from: 'main' });
    expect(result).toMatchObject({ action: 'created', base: 'main', carried: 1 });
    expect(git(repo, 'log', '--format=%s', '-1')).toBe('Initial commit');
  });

  it('refuses to switch to an existing branch with uncommitted changes, leaving the task untouched', async () => {
    git(repo, 'branch', 'fix/SOJA-1-fix-stripe-webhook-duplicates');
    writeFileSync(join(repo, 'README.md'), 'changed');
    await expect(app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).rejects.toThrow(/1 uncommitted change\b/);
    const task = await app.services.tasks.get(app.session, 'SOJA-1');
    expect(task).toMatchObject({ status: 'todo', branch: null, assigneeId: null });
    expect(git(repo, 'branch', '--show-current')).toBe('main');
  });

  it('recreates a recorded branch that was deleted', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' });
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'branch', '-D', '--quiet', 'fix/SOJA-1-fix-stripe-webhook-duplicates');
    expect((await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).action).toBe('recreated');
  });

  it('keeps a branch name edited by hand, and rejects invalid ones', async () => {
    await app.services.tasks.update(app.session, 'SOJA-1', { branch: 'hotfix/stripe' });
    expect((await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).branch).toBe('hotfix/stripe');
    await app.services.tasks.update(app.session, 'SOJA-1', { branch: 'bad..name' });
    await expect(app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).rejects.toThrow(/not a valid Git branch name/);
  });

  it('explains a linked repository that disappeared', async () => {
    rmSync(repo, { recursive: true, force: true });
    await expect(app.services.git.start(app.session, 'SOJA-1', { cwd: '/' })).rejects.toThrow(/repository is gone/);
  });
});

describe('repository resolution', () => {
  it('uses the current repository for a task without a project', async () => {
    await app.services.tasks.create(app.session, { title: 'Loose task' });
    const result = await app.services.git.start(app.session, 'SOJA-1', { cwd: repo });
    expect(result.branch).toBe('feat/SOJA-1-loose-task');
  });

  it('needs a repository somewhere', async () => {
    await app.services.tasks.create(app.session, { title: 'Loose task' });
    const plain = outside();
    try {
      await expect(app.services.git.start(app.session, 'SOJA-1', { cwd: plain })).rejects.toThrow(
        /no project and this directory is not a Git repository/,
      );
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('links an unlinked project only when asked', async () => {
    await app.services.tasks.create(app.session, { title: 'Needs link', projectId: project.id });
    await expect(app.services.git.start(app.session, 'SOJA-1', { cwd: repo })).rejects.toThrow(/has no repository linked/);
    const result = await app.services.git.start(app.session, 'SOJA-1', { cwd: repo, link: true });
    expect(result.linked).toBe(true);
    expect((await app.services.projects.get(app.session, project.id)).repositoryPath).toBe(repo);
  });
});

describe('failures halfway', () => {
  it('leaves the task unchanged when Git fails', async () => {
    const failing = new CliGit();
    failing.createBranch = async () => {
      throw new GitError('Git: simulated failure');
    };
    const failingApp = await createSetUpApp(failing);
    try {
      const linkedProject = await failingApp.services.projects.create(failingApp.session, { name: 'SPRING' });
      await failingApp.services.projects.linkRepository(failingApp.session, linkedProject, repo);
      await failingApp.services.tasks.create(failingApp.session, { title: 'x', projectId: linkedProject.id, assigneeId: null });

      await expect(failingApp.services.git.start(failingApp.session, 'SOJA-1', { cwd: '/' })).rejects.toThrow('simulated');
      const task = await failingApp.services.tasks.get(failingApp.session, 'SOJA-1');
      expect(task).toMatchObject({ status: 'todo', branch: null, assigneeId: null });
      expect(task.timeline).toHaveLength(1);
    } finally {
      failingApp.close();
    }
  });
});

describe('inspect', () => {
  beforeEach(async () => {
    await app.services.projects.linkRepository(app.session, project, repo);
    await app.services.tasks.create(app.session, { title: 'Webhook', type: 'bug', projectId: project.id });
  });

  it('suggests a branch before start', async () => {
    const state = await app.services.git.inspect(app.session, 'SOJA-1', '/');
    expect(state).toMatchObject({ status: 'ready', branch: 'fix/SOJA-1-webhook', recorded: false, branchExists: false, commits: [] });
  });

  it('lists commits on the branch and commits that mention the task, but not SOJA-12', async () => {
    commitFile(repo, 'a.txt', 'a', 'Prepare SOJA-1: config');
    commitFile(repo, 'b.txt', 'b', 'Unrelated SOJA-12 work');
    await app.services.git.start(app.session, 'SOJA-1', { cwd: '/' });
    commitFile(repo, 'c.txt', 'c', 'Add idempotency keys');
    writeFileSync(join(repo, 'wip.txt'), 'x');

    const state = await app.services.git.inspect(app.session, 'SOJA-1', '/');
    if (state.status !== 'ready') throw new Error(state.reason);
    expect(state).toMatchObject({ recorded: true, branchExists: true, checkedOut: true, uncommitted: 1 });
    expect(state.commits.map((commit) => commit.subject)).toEqual(['Add idempotency keys', 'Prepare SOJA-1: config']);
  });

  it('reports problems instead of throwing', async () => {
    await app.services.projects.unlinkRepository(app.session, project);
    const plain = outside();
    try {
      const state = await app.services.git.inspect(app.session, 'SOJA-1', plain);
      expect(state).toMatchObject({ status: 'unavailable' });
      expect(state.reason).toContain('no local folder linked on this machine.');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
