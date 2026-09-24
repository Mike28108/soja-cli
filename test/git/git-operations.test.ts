import { realpathSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { CliGit } from '../../src/git/cli-git.js';
import { GitConsole } from '../../src/git/console.js';
import { GitError } from '../../src/git/types.js';
import { commitFile, createRepo, createSetUpApp, git, tempDir, type TestApp } from '../helpers.js';

let app: TestApp & { session: Session };
let dir: ReturnType<typeof tempDir>;
let repo: string;
const cwd = '/';

async function setup(client?: CliGit) {
  dir = tempDir();
  repo = createRepo(join(realpathSync(dir.path)));
  app = await createSetUpApp(client);
  const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
  await app.services.projects.linkRepository(app.session, project, repo);
  await app.services.tasks.create(app.session, { title: 'Webhook dedupe', type: 'bug', projectId: project.id, description: 'Stripe retries' });
}

const texts = async () =>
  (await app.services.tasks.get(app.session, 'SOJA-1')).timeline.flatMap((entry) => (entry.kind === 'event' ? [entry.text] : []));

afterEach(() => {
  app.close();
  dir.cleanup();
});

describe('commit', () => {
  beforeEach(() => setup());

  it('needs to be on the task branch', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a');
    await expect(app.services.git.commit(app.session, 'SOJA-1', { cwd, message: 'x', paths: ['a.txt'] })).rejects.toThrow(
      /has no branch yet/,
    );
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    git(repo, 'switch', '--quiet', 'main');
    await expect(app.services.git.commit(app.session, 'SOJA-1', { cwd, message: 'x', paths: ['a.txt'] })).rejects.toMatchObject({
      code: 'wrong_branch',
    });
  });

  it('commits only the selected files, handles deletions and renames, and tags the message', async () => {
    commitFile(repo, 'old.txt', 'old', 'Add old');
    commitFile(repo, 'gone.txt', 'gone', 'Add gone');
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    writeFileSync(join(repo, 'new.txt'), 'new');
    writeFileSync(join(repo, 'skip.txt'), 'not selected');
    unlinkSync(join(repo, 'gone.txt'));
    renameSync(join(repo, 'old.txt'), join(repo, 'renamed.txt'));
    git(repo, 'add', '-A', 'old.txt', 'renamed.txt');

    const state = await app.services.git.workingState(app.session, 'SOJA-1', cwd);
    expect(state.files.map((file) => [file.path, file.kind]).sort()).toEqual([
      ['gone.txt', 'deleted'],
      ['new.txt', 'untracked'],
      ['renamed.txt', 'renamed'],
      ['skip.txt', 'untracked'],
    ]);

    const result = await app.services.git.commit(app.session, 'SOJA-1', {
      cwd,
      message: 'Deduplicate events',
      paths: ['new.txt', 'gone.txt', 'renamed.txt'],
    });
    expect(result.subject).toBe('Deduplicate events (SOJA-1)');
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Deduplicate events (SOJA-1)');
    expect(git(repo, 'status', '--porcelain')).toBe('?? skip.txt');
    expect(await texts()).toContain(`committed ${result.hash.slice(0, 7)} “Deduplicate events (SOJA-1)”`);

    await app.services.git.commit(app.session, 'SOJA-1', { cwd, message: 'soja-1: include skip', paths: ['skip.txt'] });
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('soja-1: include skip');
  });

  it('validates the message and the selection', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    writeFileSync(join(repo, 'a.txt'), 'a');
    await expect(app.services.git.commit(app.session, 'SOJA-1', { cwd, message: ' ', paths: ['a.txt'] })).rejects.toThrow(/message/);
    await expect(app.services.git.commit(app.session, 'SOJA-1', { cwd, message: 'x', paths: [] })).rejects.toThrow(/at least one/);
    await expect(app.services.git.commit(app.session, 'SOJA-1', { cwd, message: 'x', paths: ['ghost.txt'] })).rejects.toMatchObject({
      code: 'nothing_to_commit',
    });
  });
});

describe('merge and delete', () => {
  beforeEach(() => setup());

  it('merges into the base with a merge commit, then deletes the merged branch', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    commitFile(repo, 'fix.txt', 'fix', 'Fix (SOJA-1)');

    const plan = await app.services.git.mergePlan(app.session, 'SOJA-1', cwd);
    expect(plan).toMatchObject({ branch: 'fix/SOJA-1-webhook-dedupe', into: 'main', alreadyMerged: false });

    const merged = await app.services.git.merge(app.session, 'SOJA-1', { cwd });
    expect(merged.into).toBe('main');
    expect(git(repo, 'branch', '--show-current')).toBe('main');
    expect(git(repo, 'log', '-1', '--format=%s %p').split(' ').length).toBe(6); // subject words + 2 parents
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Merge SOJA-1: Webhook dedupe');
    await expect(app.services.git.merge(app.session, 'SOJA-1', { cwd })).rejects.toThrow(/already merged/);

    const deleted = await app.services.git.deleteBranch(app.session, 'SOJA-1', { cwd });
    expect(deleted).toMatchObject({ merged: true, switchedTo: null });
    expect(git(repo, 'branch', '--list', 'fix/*')).toBe('');
    expect((await app.services.tasks.get(app.session, 'SOJA-1')).branch).toBeNull();
    expect(await texts()).toEqual(
      expect.arrayContaining(['merged fix/SOJA-1-webhook-dedupe into main', 'deleted branch fix/SOJA-1-webhook-dedupe']),
    );
  });

  it('merges into the branch the task started from', async () => {
    git(repo, 'switch', '--quiet', '-c', 'develop');
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    commitFile(repo, 'fix.txt', 'fix', 'Fix');
    expect((await app.services.git.merge(app.session, 'SOJA-1', { cwd })).into).toBe('develop');
  });

  it('refuses to merge with uncommitted changes', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    commitFile(repo, 'fix.txt', 'fix', 'Fix');
    writeFileSync(join(repo, 'wip.txt'), 'wip');
    await expect(app.services.git.merge(app.session, 'SOJA-1', { cwd })).rejects.toMatchObject({ code: 'dirty_worktree' });
  });

  it('reports conflicts with the files involved, and can abort', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    commitFile(repo, 'README.md', 'branch version', 'Branch edit');
    git(repo, 'switch', '--quiet', 'main');
    commitFile(repo, 'README.md', 'main version', 'Main edit');

    const failure = await app.services.git.merge(app.session, 'SOJA-1', { cwd }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GitError);
    expect(failure).toMatchObject({ code: 'merge_conflict' });
    expect((failure as GitError).suggestions).toContain('conflict: README.md');

    await app.services.git.abortMerge(app.session, 'SOJA-1', cwd);
    expect(git(repo, 'status', '--porcelain')).toBe('');
    await expect(app.services.git.abortMerge(app.session, 'SOJA-1', cwd)).rejects.toThrow(/no merge in progress/);
  });

  it('needs force for an unmerged branch and switches away from it first', async () => {
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    commitFile(repo, 'wip.txt', 'wip', 'Unmerged work');
    await expect(app.services.git.deleteBranch(app.session, 'SOJA-1', { cwd })).rejects.toMatchObject({ code: 'not_merged' });

    const deleted = await app.services.git.deleteBranch(app.session, 'SOJA-1', { cwd, force: true });
    expect(deleted).toMatchObject({ merged: false, switchedTo: 'main' });
    expect(git(repo, 'branch', '--show-current')).toBe('main');
    expect(await texts()).toContain('deleted branch fix/SOJA-1-webhook-dedupe (unmerged)');
  });
});

describe('push and pull requests', () => {
  it('pushes to origin and streams the commands to the console', async () => {
    const console = new GitConsole();
    await setup(new CliGit(console));
    const remote = join(realpathSync(dir.path), '..', `remote-${process.pid}-${Date.now()}.git`);
    git(realpathSync(dir.path), 'init', '--quiet', '--bare', remote);
    git(repo, 'remote', 'add', 'origin', remote);
    await app.services.git.start(app.session, 'SOJA-1', { cwd });

    await app.services.git.push(app.session, 'SOJA-1', { cwd });
    expect(git(remote, 'branch', '--list')).toContain('fix/SOJA-1-webhook-dedupe');
    expect(console.since().map((line) => line.text)).toContain('$ git push --set-upstream origin fix/SOJA-1-webhook-dedupe');
    expect(await texts()).toContain('pushed fix/SOJA-1-webhook-dedupe to origin');
  });

  it('explains a missing origin', async () => {
    await setup();
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    await expect(app.services.git.push(app.session, 'SOJA-1', { cwd })).rejects.toMatchObject({ code: 'no_remote' });
  });

  it('opens a pull request into the base with the task in title and body', async () => {
    const requests: unknown[] = [];
    const client = new CliGit();
    client.push = async () => undefined;
    client.createPullRequest = async (_root, request) => {
      requests.push(request);
      return 'https://github.com/bravos/enrollbridge/pull/7';
    };
    await setup(client);
    git(repo, 'remote', 'add', 'origin', 'git@github.com:bravos/enrollbridge.git');
    await app.services.git.start(app.session, 'SOJA-1', { cwd });

    const result = await app.services.git.openPullRequest(app.session, 'SOJA-1', { cwd });
    expect(result.url).toBe('https://github.com/bravos/enrollbridge/pull/7');
    expect(requests).toEqual([
      {
        base: 'main',
        head: 'fix/SOJA-1-webhook-dedupe',
        title: 'Webhook dedupe (SOJA-1)',
        body: 'Stripe retries\n\nSOJA task: SOJA-1',
      },
    ]);
    expect(await texts()).toContain('opened a pull request https://github.com/bravos/enrollbridge/pull/7');
  });
});
