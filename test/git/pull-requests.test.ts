import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { CliGit, parsePullRequests } from '../../src/git/cli-git.js';
import { GitConsole } from '../../src/git/console.js';
import { createRepo, createSetUpApp, git, tempDir, type TestApp } from '../helpers.js';
import { ghPr, installFakeGh, type FakeGh } from './fake-gh.js';

const BRANCH = 'fix/SOJA-1-webhook-dedupe';
let app: TestApp & { session: Session };
let dir: ReturnType<typeof tempDir>;
let repo: string;
const cwd = '/';

let fake: FakeGh;
const writeState = (state: object) => fake.write(state);
const ghCalls = () => fake.calls();
const texts = async () =>
  (await app.services.tasks.get(app.session, 'SOJA-1')).timeline.flatMap((entry) => (entry.kind === 'event' ? [entry.text] : []));

beforeEach(async () => {
  dir = tempDir();
  const root = realpathSync(dir.path);
  mkdirSync(join(root, 'repo'));
  repo = createRepo(join(root, 'repo'));
  fake = installFakeGh(root);
  app = await createSetUpApp(new CliGit(new GitConsole(), { git: 'git', gh: fake.gh }));
  const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
  await app.services.projects.linkRepository(app.session, project, repo);
  await app.services.tasks.create(app.session, { title: 'Webhook dedupe', type: 'bug', projectId: project.id });
});
afterEach(() => {
  app.close();
  dir.cleanup();
  delete process.env.FAKE_GH_STATE;
});

describe('reading pull requests from gh', () => {
  it('summarizes checks, reviews and mergeability, and strips terminal escapes', () => {
    const [pr] = parsePullRequests(
      JSON.stringify([
        ghPr(BRANCH, {
          title: 'Evil \u001b]52;c;ZXZpbA==\u0007title',
          reviewDecision: 'APPROVED',
          statusCheckRollup: [
            { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
            { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
            { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'TIMED_OUT' },
            { __typename: 'StatusContext', context: 'ci/legacy', state: 'ERROR' },
            { __typename: 'StatusContext', context: 'deploy', state: 'PENDING' },
            { __typename: 'CheckRun', name: 'docs', status: 'COMPLETED', conclusion: 'SKIPPED' },
          ],
        }),
      ]),
    );
    expect(pr).toMatchObject({ number: 12, state: 'open', review: 'approved', mergeable: 'mergeable', title: 'Evil ]52;c;ZXZpbA==title' });
    expect(pr?.checks).toEqual({ total: 6, passed: 2, failed: 2, pending: 2, failing: ['lint', 'ci/legacy'] });
  });

  it('reports the task PR, or why there is none', async () => {
    expect(await app.services.git.pullRequest(app.session, 'SOJA-1', cwd)).toMatchObject({ status: 'none', reason: 'No branch yet.' });
    await app.services.git.start(app.session, 'SOJA-1', { cwd });
    expect(await app.services.git.pullRequest(app.session, 'SOJA-1', cwd)).toMatchObject({ status: 'none', reason: 'No pull request yet.' });
    writeState({ prs: [ghPr(BRANCH)] });
    const found = await app.services.git.pullRequest(app.session, 'SOJA-1', cwd);
    expect(found).toMatchObject({ status: 'found', pr: { number: 12, checks: { failed: 1, failing: ['lint'] } } });
    writeState({ prs: [], fail: 'To get started with GitHub CLI, please run:  gh auth login' });
    expect(await app.services.git.pullRequest(app.session, 'SOJA-1', cwd)).toMatchObject({ status: 'unavailable', code: 'gh_auth' });
  });

  it('says so when gh is not installed', async () => {
    app.close();
    app = await createSetUpApp(new CliGit(new GitConsole(), { git: 'git', gh: join(dir.path, 'no-such-gh') }));
    const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
    await app.services.projects.linkRepository(app.session, project, repo);
    await app.services.tasks.create(app.session, { title: 'x', projectId: project.id });
    await app.services.tasks.update(app.session, 'SOJA-1', { branch: BRANCH });
    expect(await app.services.git.pullRequest(app.session, 'SOJA-1', cwd)).toMatchObject({ status: 'unavailable', code: 'gh_missing' });
  });
});

describe('following pull requests', () => {
  beforeEach(() => app.services.git.start(app.session, 'SOJA-1', { cwd }));

  it('records failing checks once per commit', async () => {
    writeState({ prs: [ghPr(BRANCH)] });
    expect((await app.services.git.followPullRequests(app.session, cwd, { only: 'SOJA-1' })).map((u) => u.kind)).toEqual(['checks_failed']);
    expect(await app.services.git.followPullRequests(app.session, cwd, { only: 'SOJA-1' })).toEqual([]);
    writeState({ prs: [ghPr(BRANCH, { headRefOid: 'bbbbbbb2222222' })] });
    await app.services.git.followPullRequests(app.session, cwd, { only: 'SOJA-1' });
    expect((await texts()).filter((text) => text.startsWith('checks failed'))).toEqual([
      'checks failed on PR #12 (aaaaaaa): lint',
      'checks failed on PR #12 (bbbbbbb): lint',
    ]);
  });

  it('closes the task when its PR was merged on GitHub, once', async () => {
    writeState({ prs: [ghPr(BRANCH, { state: 'MERGED', mergedAt: '2026-09-24T12:00:00Z' })] });
    const [update] = await app.services.git.followPullRequests(app.session, cwd);
    expect(update).toMatchObject({ kind: 'merged', task: { status: 'done' }, pr: { number: 12 } });
    expect(await texts()).toContain('PR #12 was merged into main on GitHub');
    // Reopened for follow-up work: it is not closed again.
    await app.services.tasks.reopen(app.session, 'SOJA-1');
    expect(await app.services.git.followPullRequests(app.session, cwd, { only: 'SOJA-1' })).toEqual([]);
    expect((await app.services.tasks.get(app.session, 'SOJA-1')).status).toBe('todo');
  });

  it('reuses one gh call per repository for list markers', async () => {
    writeState({ prs: [ghPr(BRANCH)] });
    const tasks = await app.services.tasks.list(app.session, 'all');
    const first = await app.services.git.pullRequestIndex(app.session, cwd, tasks);
    await app.services.git.pullRequestIndex(app.session, cwd, tasks);
    expect([...first.values()].map((pr) => pr.number)).toEqual([12]);
    expect(ghCalls().filter((call) => call.startsWith('pr list'))).toHaveLength(1);
  });
});

describe('merging the pull request from SOJA', () => {
  beforeEach(() => app.services.git.start(app.session, 'SOJA-1', { cwd }));

  it('merges with a merge commit, deletes the branch, and closes the task', async () => {
    writeState({ prs: [ghPr(BRANCH, { reviewDecision: 'APPROVED' })] });
    const result = await app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: true });
    expect(result.task.status).toBe('done');
    expect(result.task.branch).toBeNull();
    expect(ghCalls()).toContain('pr merge 12 --merge --delete-branch');
    expect(git(repo, 'branch', '--list', BRANCH)).toBe('');
    expect(await texts()).toEqual(expect.arrayContaining(['merged PR #12 into main on GitHub']));
  });

  it('refuses drafts, merged PRs, and deleting a checked-out branch with local changes', async () => {
    writeState({ prs: [ghPr(BRANCH, { isDraft: true })] });
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: false })).rejects.toThrow(/is a draft/);
    writeState({ prs: [ghPr(BRANCH, { state: 'MERGED' })] });
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: false })).rejects.toThrow(/already merged/);
    writeState({ prs: [ghPr(BRANCH)] });
    writeFileSync(join(repo, 'wip.txt'), 'wip');
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: true })).rejects.toMatchObject({ code: 'dirty_worktree' });
    expect(ghCalls().some((call) => call.startsWith('pr merge'))).toBe(false);
  });

  it('explains when the repository rules block the merge, and leaves the task open', async () => {
    writeState({ prs: [ghPr(BRANCH)], mergeFail: 'X Pull request #12 is not mergeable: the merge commit cannot be cleanly created.' });
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: false })).rejects.toMatchObject({
      code: 'merge_conflict',
    });
    writeState({ prs: [ghPr(BRANCH)], mergeFail: 'X Pull request #12 is not mergeable: the base branch policy prohibits the merge.' });
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: false })).rejects.toMatchObject({
      code: 'blocked',
    });
    writeState({ prs: [ghPr(BRANCH)], mergeFail: 'GraphQL: Required status check "lint" is failing. (mergePullRequest)' });
    await expect(app.services.git.mergePullRequest(app.session, 'SOJA-1', { cwd, deleteBranch: false })).rejects.toMatchObject({
      code: 'blocked',
    });
    expect((await app.services.tasks.get(app.session, 'SOJA-1')).status).not.toBe('done');
  });
});
