import { realpathSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { findMergeEvidence } from '../../src/git/merge-evidence.js';
import { commitFile, createRepo, createSetUpApp, git, tempDir, type TestApp } from '../helpers.js';

const BRANCH = 'fix/SOJA-1-webhook';
const cwd = '/';
let app: TestApp & { session: Session };
let dir: ReturnType<typeof tempDir>;
let repo: string;

beforeEach(async () => {
  dir = tempDir();
  repo = createRepo(realpathSync(dir.path));
  app = await createSetUpApp();
  const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
  await app.services.projects.linkRepository(app.session, project, repo);
  await app.services.tasks.create(app.session, { title: 'Webhook', type: 'bug', projectId: project.id });
  await app.services.git.start(app.session, 'SOJA-1', { cwd });
});
afterEach(() => {
  app.close();
  dir.cleanup();
});

const detect = () => app.services.git.detectMerges(app.session, cwd);
const status = async () => (await app.services.tasks.get(app.session, 'SOJA-1')).status;

describe('detecting merges done outside SOJA', () => {
  it('does not treat a fresh branch as merged, even when main moves on', async () => {
    git(repo, 'switch', '--quiet', 'main');
    commitFile(repo, 'other.txt', 'x', 'Unrelated work on main');
    expect(await detect()).toEqual([]);
    expect(await status()).toBe('in_progress');
  });

  it('detects a manual merge commit and marks the task Done, with a timeline entry', async () => {
    commitFile(repo, 'fix.txt', 'fix', 'Work by an agent');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', BRANCH);

    const [result] = await detect();
    expect(result).toMatchObject({ kind: 'merged', into: 'main', branch: BRANCH });
    expect(await status()).toBe('done');
    const { timeline } = await app.services.tasks.get(app.session, 'SOJA-1');
    const texts = timeline.flatMap((entry) => (entry.kind === 'event' ? [entry.text] : []));
    expect(texts.slice(-2)).toEqual(['merge into main detected (done outside SOJA)', 'completed it · In Progress → Done']);
    expect(await detect()).toEqual([]); // closed tasks are not checked again
  });

  it('detects a fast-forward merge while the branch still exists', async () => {
    commitFile(repo, 'fix.txt', 'fix', 'Work');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'merge', '--quiet', '--ff-only', BRANCH);
    expect((await detect())[0]?.kind).toBe('merged');
  });

  it('detects a merge after the branch was deleted', async () => {
    commitFile(repo, 'fix.txt', 'fix', 'Work');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', BRANCH);
    git(repo, 'branch', '--quiet', '-D', BRANCH);
    expect((await detect())[0]).toMatchObject({ kind: 'merged' });
  });

  it('detects a GitHub squash merge pulled into main', async () => {
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'branch', '--quiet', '-D', BRANCH);
    commitFile(repo, 'fix.txt', 'fix', 'Webhook (SOJA-1) (#5)');
    expect((await detect())[0]).toMatchObject({ kind: 'merged' });
  });

  it('reports a branch deleted without any sign of a merge, without changing the task', async () => {
    commitFile(repo, 'fix.txt', 'fix', 'Abandoned work');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'branch', '--quiet', '-D', BRANCH);
    commitFile(repo, 'note.txt', 'n', 'Mention SOJA-1 in a normal commit');

    expect(await detect()).toMatchObject([{ kind: 'deleted', branch: BRANCH }]);
    expect(await status()).toBe('in_progress');

    const forgotten = await app.services.git.forgetBranch(app.session, 'SOJA-1');
    expect(forgotten.branch).toBeNull();
    expect(await detect()).toEqual([]);
  });

  it('can check a single task, and skips tasks whose repository is unavailable', async () => {
    await app.services.tasks.create(app.session, { title: 'No repo' });
    await app.services.tasks.update(app.session, 'SOJA-2', { branch: 'feat/SOJA-2-no-repo' });
    commitFile(repo, 'fix.txt', 'fix', 'Work');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', BRANCH);

    const plain = realpathSync(dir.path) + '-nowhere';
    expect(await app.services.git.detectMerges(app.session, plain, { only: 'SOJA-2' })).toEqual([]);
    expect(await app.services.git.detectMerges(app.session, plain, { only: 'SOJA-1' })).toHaveLength(1);
  });

  it('records where the branch started', async () => {
    const task = await app.services.tasks.get(app.session, 'SOJA-1');
    expect(task.branchStart).toBe(git(repo, 'rev-parse', 'main'));
  });
});

describe('findMergeEvidence', () => {
  const target = { branch: BRANCH, ref: 'SOJA-1' };
  const commit = (message: string, parents = 1) => ({
    hash: message,
    parents: Array.from({ length: parents }, (_, index) => `p${index}`),
    message,
  });

  it('accepts merge commits naming the branch or the task', () => {
    expect(findMergeEvidence([commit(`Merge branch '${BRANCH}'`, 2)], target)).toBeTruthy();
    expect(findMergeEvidence([commit(`Merge pull request #5 from me/${BRANCH}`, 2)], target)).toBeTruthy();
    expect(findMergeEvidence([commit('Merge SOJA-1: Webhook', 2)], target)).toBeTruthy();
  });

  it('accepts GitHub squash commits that mention the task', () => {
    expect(findMergeEvidence([commit('Webhook (SOJA-1) (#12)')], target)).toBeTruthy();
  });

  it('ignores plain commits, other tasks and longer numbers', () => {
    expect(findMergeEvidence([commit('Prepare SOJA-1')], target)).toBeNull();
    expect(findMergeEvidence([commit('Merge SOJA-12: other', 2)], target)).toBeNull();
    expect(findMergeEvidence([commit('Something (SOJA-10) (#3)')], target)).toBeNull();
  });
});
