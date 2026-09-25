import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { App } from '../../src/ui/App.js';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitFile, createRepo, createSetUpApp, createTestApp, git, tempDir, type TestApp } from '../helpers.js';
import { CliGit } from '../../src/git/cli-git.js';
import { GitConsole } from '../../src/git/console.js';
import { ghPr, installFakeGh } from '../git/fake-gh.js';

const ESC = '\u001B';
const ENTER = '\r';
const CTRL_K = '\u000B';

/** Lets React commit, effects run and async service calls settle. */
const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(stdin: { write(data: string): void }, text: string) {
  for (const char of text) {
    stdin.write(char);
    await settle(15);
  }
  await settle();
}

async function press(stdin: { write(data: string): void }, key: string) {
  stdin.write(key);
  await settle();
}

let app: TestApp;
let ui: ReturnType<typeof render> | undefined;
// A scratch directory outside any repository, so Git features never read this project's history.
let workdir: ReturnType<typeof tempDir>;
afterEach(() => {
  ui?.unmount();
  ui = undefined;
  app.close();
  workdir.cleanup();
});

async function start(testApp: TestApp) {
  app = testApp;
  workdir = tempDir();
  ui = render(<App services={app.services} splashMs={0} cwd={workdir.path} />);
  await settle(150);
  return ui;
}

describe('first run', () => {
  it('walks through setup and lands on an empty My Work', async () => {
    const { stdin, lastFrame } = await start(await createTestApp());
    expect(lastFrame()).toContain('Welcome to SOJA');
    await press(stdin, 'l');
    expect(lastFrame()).toContain('First setup');

    await type(stdin, 'Michael');
    await press(stdin, ENTER);
    expect(lastFrame()).toContain('michael'); // suggested username
    await press(stdin, ENTER);
    await type(stdin, 'Bravos Development');
    await press(stdin, ENTER);
    await settle(150);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('My work');
    expect(frame).toContain('No tasks assigned.');
    expect(frame).toContain('@michael');
    expect(app.config.load()?.mode).toBe('local');
  });

  it('shows validation errors inline and stays on the step', async () => {
    const { stdin, lastFrame } = await start(await createTestApp());
    await press(stdin, 'l');
    await press(stdin, ENTER);
    expect(lastFrame()).toContain('This one is required.');
  });
});

describe('daily use', () => {
  let session: Session;

  async function seeded() {
    const testApp = await createSetUpApp();
    session = testApp.session;
    const project = await testApp.services.projects.create(session, { name: 'EnrollBridge' });
    await testApp.services.tasks.create(session, { title: 'Fix Stripe webhook', projectId: project.id, priority: 'high' });
    await testApp.services.tasks.create(session, { title: 'Add pitch velocity', priority: 'low' });
    await testApp.services.tasks.create(session, { title: 'Blocked on vendor', status: 'blocked', assigneeId: null });
    return start(testApp);
  }

  it('lists my work and opens a task with enter', async () => {
    const { stdin, lastFrame } = await seeded();
    expect(lastFrame()).toContain('SOJA-1');
    expect(lastFrame()).toContain('Fix Stripe webhook');
    expect(lastFrame()).not.toContain('Blocked on vendor'); // not mine

    await press(stdin, ENTER);
    await settle(100);
    const detail = lastFrame() ?? '';
    expect(detail).toContain('Activity');
    expect(detail).toContain('created the task');
    expect(detail).toContain('EnrollBridge');

    await press(stdin, ESC);
    await settle(100);
    expect(lastFrame()).toContain('My work');
  });

  it('archives from the Edit menu, finds it in Archived tasks, and deletes it after two confirmations', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, ENTER); // SOJA-1
    await settle(100);
    await press(stdin, 'e');
    await settle(80);
    await press(stdin, 'G');
    await press(stdin, 'k'); // Archive
    await press(stdin, ENTER);
    await settle(150);
    expect(lastFrame()).toContain('archived');
    await press(stdin, ESC);
    await settle(150);
    expect(lastFrame()).not.toContain('Fix Stripe webhook');

    await press(stdin, ':');
    await type(stdin, 'Archived');
    await press(stdin, ENTER);
    await settle(150);
    expect(lastFrame()).toContain('Archived');
    expect(lastFrame()).toContain('Fix Stripe webhook');

    await press(stdin, ENTER);
    await settle(100);
    await press(stdin, 'e');
    await settle(80);
    await press(stdin, 'G'); // Delete permanently…
    await press(stdin, ENTER);
    await settle(80);
    expect(lastFrame()).toContain('Delete this task for good?');
    await press(stdin, '2');
    await settle(80);
    expect(lastFrame()).toContain('Really delete it?');
    await press(stdin, '2');
    await settle(200);
    expect(lastFrame()).toContain('SOJA-1 deleted');
    expect(lastFrame()).toContain('Archived');
    expect(lastFrame()).not.toContain('Fix Stripe webhook');
  });

  it('changes status from the task view and persists it', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, ENTER);
    await settle(100);
    await press(stdin, 's');
    expect(lastFrame()).toContain('Status');
    await press(stdin, '3'); // In Progress
    await settle(100);

    expect(lastFrame()).toContain('moved Todo → In Progress');
    const task = await app.services.tasks.get(session, 'SOJA-1');
    expect(task.status).toBe('in_progress');
  });

  it('creates a task with only a title', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, 'n');
    expect(lastFrame()).toContain('New task');
    await type(stdin, 'Marketing banner typo');
    await press(stdin, ENTER);
    await settle(100);

    expect(lastFrame()).toContain('Marketing banner typo');
    const [created] = await app.services.tasks.search(session, 'banner');
    expect(created).toMatchObject({ ref: 'SOJA-4', assigneeId: session.user.id, status: 'todo' });
  });

  it('adds a comment that shows up in the timeline', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, ENTER);
    await settle(100);
    await press(stdin, 'c');
    await type(stdin, 'Looking into it');
    await press(stdin, ENTER);
    await settle(100);
    expect(lastFrame()).toContain('Looking into it');
  });

  it('searches as you type and opens the result', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, '/');
    await type(stdin, 'pitch');
    await settle(100);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Add pitch velocity');
    // The list behind the search window still shows it once; the results do not.
    expect(frame.split('Fix Stripe webhook').length - 1).toBe(1);

    await press(stdin, ENTER);
    await settle(100);
    expect(lastFrame()).toContain('Activity');
  });

  it('switches filters and uses the command palette', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, '6'); // Blocked
    await settle(100);
    expect(lastFrame()).toContain('Blocked on vendor');

    await press(stdin, CTRL_K);
    expect(lastFrame()).toContain('Commands');
    await type(stdin, 'all tasks');
    await press(stdin, ENTER);
    await settle(100);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('All Tasks');
    expect(frame).toContain('Blocked on vendor');
    expect(frame).toContain('Add pitch velocity');
  });

  it('esc always closes the topmost thing first', async () => {
    const { stdin, lastFrame } = await seeded();
    await press(stdin, ENTER);
    await settle(100);
    await press(stdin, 'p');
    expect(lastFrame()).toContain('Priority');
    await press(stdin, ESC);
    expect(lastFrame()).toContain('Activity');
    await press(stdin, ESC);
    await settle(100);
    expect(lastFrame()).toContain('My work');
  });
});

describe('git workflow in the interface', () => {
  it('starts a task on its branch with b and shows the commits', async () => {
    const testApp = await createSetUpApp();
    const repoDir = tempDir();
    try {
      const repo = createRepo(realpathSync(repoDir.path));
      const project = await testApp.services.projects.create(testApp.session, { name: 'EnrollBridge' });
      await testApp.services.projects.linkRepository(testApp.session, project, repo);
      await testApp.services.tasks.create(testApp.session, { title: 'Webhook duplicates', type: 'bug', projectId: project.id });

      const { stdin, lastFrame } = await start(testApp);
      await press(stdin, ENTER);
      await settle(200);
      expect(lastFrame()).toContain('suggested · b to start');

      await press(stdin, 'b');
      await settle(150);
      expect(lastFrame()).toContain('Create fix/SOJA-1-webhook-duplicates from main');
      await press(stdin, ENTER);
      await settle(250);

      expect(git(repo, 'branch', '--show-current')).toBe('fix/SOJA-1-webhook-duplicates');
      expect(lastFrame()).toContain('checked out');
      expect((await testApp.services.tasks.get(testApp.session, 'SOJA-1')).status).toBe('in_progress');

      commitFile(repo, 'fix.txt', 'x', 'Deduplicate Stripe events');
      // Commits made outside SOJA show up on the next refresh: any change in SOJA, or reopening the task.
      await press(stdin, 'x');
      await settle(250);
      expect(lastFrame()).toContain('Deduplicate Stripe events');
    } finally {
      repoDir.cleanup();
    }
  });
});

describe('repository picker', () => {
  it('asks for a parent folder first, then links a project by picking a subfolder', async () => {
    const testApp = await createSetUpApp();
    const folders = tempDir();
    try {
      const products = join(realpathSync(folders.path), 'products');
      mkdirSync(products);
      for (const name of ['enrollbridge', 'spring-web']) {
        mkdirSync(join(products, name));
        createRepo(join(products, name));
      }
      await testApp.services.projects.create(testApp.session, { name: 'EnrollBridge' });

      const { stdin, lastFrame } = await start(testApp);
      await press(stdin, 'p');
      await settle(150);
      await press(stdin, 'r');
      await settle(100);
      expect(lastFrame()).toContain('Add parent folder');

      await type(stdin, products);
      await press(stdin, ENTER);
      await settle(200);
      expect(lastFrame()).toContain('Repository for EnrollBridge');
      expect(lastFrame()).toContain('products/spring-web');

      await type(stdin, 'enroll');
      await press(stdin, ENTER);
      await settle(200);

      const [project] = await testApp.services.projects.list(testApp.session);
      expect(project?.repositoryPath).toBe(join(products, 'enrollbridge'));
      expect(testApp.config.load()?.parentFolders).toEqual([products]);
    } finally {
      folders.cleanup();
    }
  });
});

describe('git operations in the interface', () => {
  async function started(client?: CliGit) {
    const testApp = await createSetUpApp(client);
    const repoDir = tempDir();
    const repo = createRepo(realpathSync(repoDir.path));
    const project = await testApp.services.projects.create(testApp.session, { name: 'EnrollBridge' });
    await testApp.services.projects.linkRepository(testApp.session, project, repo);
    await testApp.services.tasks.create(testApp.session, { title: 'Webhook', type: 'bug', projectId: project.id });
    await testApp.services.git.start(testApp.session, 'SOJA-1', { cwd: repo });
    const ui = await start(testApp);
    await press(ui.stdin, ENTER);
    await settle(200);
    return { ...ui, testApp, repo, cleanup: () => repoDir.cleanup() };
  }

  it('commits only the checked files, with live output', async () => {
    const { stdin, lastFrame, repo, cleanup } = await started();
    try {
      writeFileSync(join(repo, 'a.ts'), 'a');
      writeFileSync(join(repo, 'b.log'), 'b');
      await press(stdin, 'C');
      await settle(200);
      expect(lastFrame()).toContain('☑');
      await press(stdin, 'j');
      await press(stdin, ' '); // uncheck b.log (sorted after a.ts)
      await press(stdin, ENTER);
      await type(stdin, 'Dedupe events');
      await press(stdin, ENTER);
      await settle(400);

      expect(lastFrame()).toContain('$ git commit --only -m "Dedupe events (SOJA-1)" -- a.ts');
      expect(lastFrame()).toContain('Committed');
      expect(git(repo, 'status', '--porcelain')).toBe('?? b.log');
    } finally {
      cleanup();
    }
  });

  it('shows the GitHub pull request with its checks, and merges it from the Git menu', async () => {
    const ghDir = tempDir();
    const fake = installFakeGh(realpathSync(ghDir.path));
    fake.write({ prs: [ghPr('fix/SOJA-1-webhook')] });
    const { stdin, lastFrame, repo, testApp, cleanup } = await started(new CliGit(new GitConsole(), { git: 'git', gh: fake.gh }));
    try {
      await settle(400);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('#12 open');
      expect(frame).toContain('1 failing: lint');
      // The notice floats over the timeline for a few seconds; the entry itself is in the task.
      expect(frame).toContain('checks failed on PR #12 (lint)');
      const timeline = (await testApp.services.tasks.get(testApp.session, 'SOJA-1')).timeline;
      expect(timeline.some((entry) => entry.kind === 'event' && entry.text === 'checks failed on PR #12 (aaaaaaa): lint')).toBe(true);

      await press(stdin, 'g');
      await press(stdin, '5'); // Merge pull request on GitHub…
      await settle(300);
      expect(lastFrame()).toContain('Merge PR #12 on GitHub?');
      expect(lastFrame()).toContain('1 check failing');
      await press(stdin, '3'); // merge and delete the branch
      await settle(800);
      expect(lastFrame()).toContain('Merged PR #12 into main on GitHub');
      expect(fake.calls()).toContain('pr merge 12 --merge --delete-branch');
      expect(git(repo, 'branch', '--list', 'fix/*')).toBe('');
      expect((await testApp.services.tasks.get(testApp.session, 'SOJA-1')).status).toBe('done');
    } finally {
      cleanup();
      ghDir.cleanup();
      delete process.env.FAKE_GH_STATE;
    }
  });

  it('merges after confirmation and offers to delete the branch and finish the task', async () => {
    const { stdin, lastFrame, repo, testApp, cleanup } = await started();
    try {
      commitFile(repo, 'fix.txt', 'fix', 'Fix (SOJA-1)');
      await press(stdin, 'g');
      await press(stdin, '6'); // Merge into base…
      await settle(200);
      expect(lastFrame()).toContain('Merge into main?');
      await press(stdin, ENTER); // default is Cancel
      await settle(100);
      expect(git(repo, 'branch', '--show-current')).toBe('fix/SOJA-1-webhook');

      await press(stdin, 'g');
      await press(stdin, '6');
      await settle(200);
      await press(stdin, '2'); // confirm
      await settle(500);
      expect(lastFrame()).toContain('Merged into main');
      expect(lastFrame()).toContain('delete branch + mark Done');

      await press(stdin, 'd');
      await settle(500);
      expect(git(repo, 'branch', '--list', 'fix/*')).toBe('');
      expect((await testApp.services.tasks.get(testApp.session, 'SOJA-1')).status).toBe('done');
    } finally {
      cleanup();
    }
  });

  it('asks twice before deleting an unmerged branch', async () => {
    const { stdin, lastFrame, repo, cleanup } = await started();
    try {
      commitFile(repo, 'wip.txt', 'wip', 'Unmerged');
      await press(stdin, 'g');
      await press(stdin, '8'); // Delete branch…
      await settle(150);
      await press(stdin, '2');
      await settle(400);
      expect(lastFrame()).toContain('has commits that are not in main');
      expect(lastFrame()).toContain('delete anyway');

      await press(stdin, 'f');
      await settle(150);
      expect(lastFrame()).toContain('Delete an unmerged branch?');
      await press(stdin, '2');
      await settle(500);
      expect(lastFrame()).toContain('Deleted fix/SOJA-1-webhook');
      expect(git(repo, 'branch', '--show-current')).toBe('main');
    } finally {
      cleanup();
    }
  });
});

describe('merges done outside SOJA', () => {
  it('closes the task when SOJA opens after an agent merged its branch', async () => {
    const testApp = await createSetUpApp();
    const repoDir = tempDir();
    try {
      const repo = createRepo(realpathSync(repoDir.path));
      const project = await testApp.services.projects.create(testApp.session, { name: 'EnrollBridge' });
      await testApp.services.projects.linkRepository(testApp.session, project, repo);
      await testApp.services.tasks.create(testApp.session, { title: 'Webhook', type: 'bug', projectId: project.id });
      await testApp.services.git.start(testApp.session, 'SOJA-1', { cwd: repo });

      // Someone else (Claude, Codex, a teammate) finishes and merges it.
      commitFile(repo, 'fix.txt', 'fix', 'Agent work');
      git(repo, 'switch', '--quiet', 'main');
      git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', 'fix/SOJA-1-webhook');
      git(repo, 'branch', '--quiet', '-d', 'fix/SOJA-1-webhook');

      const { lastFrame } = await start(testApp);
      await settle(300);
      expect(lastFrame()).toContain('SOJA-1 was merged into main outside SOJA → Done');
      expect((await testApp.services.tasks.get(testApp.session, 'SOJA-1')).status).toBe('done');
    } finally {
      repoDir.cleanup();
    }
  });
});
