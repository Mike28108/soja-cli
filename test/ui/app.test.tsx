import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { App } from '../../src/ui/App.js';
import { createSetUpApp, createTestApp, type TestApp } from '../helpers.js';

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
afterEach(() => {
  ui?.unmount();
  ui = undefined;
  app.close();
});

async function start(testApp: TestApp) {
  app = testApp;
  ui = render(<App services={app.services} splashMs={0} />);
  await settle(150);
  return ui;
}

describe('first run', () => {
  it('walks through setup and lands on an empty My Work', async () => {
    const { stdin, lastFrame } = await start(await createTestApp());
    expect(lastFrame()).toContain('First setup');

    await type(stdin, 'Michael');
    await press(stdin, ENTER);
    expect(lastFrame()).toContain('michael'); // suggested username
    await press(stdin, ENTER);
    await type(stdin, 'Bravos Development');
    await press(stdin, ENTER);
    await settle(150);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('MY WORK');
    expect(frame).toContain('No tasks assigned.');
    expect(frame).toContain('@michael');
    expect(app.config.load()?.mode).toBe('local');
  });

  it('shows validation errors inline and stays on the step', async () => {
    const { stdin, lastFrame } = await start(await createTestApp());
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
    expect(detail).toContain('ACTIVITY');
    expect(detail).toContain('created the task');
    expect(detail).toContain('EnrollBridge');

    await press(stdin, ESC);
    await settle(100);
    expect(lastFrame()).toContain('MY WORK');
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
    expect(frame).not.toContain('Fix Stripe webhook');

    await press(stdin, ENTER);
    await settle(100);
    expect(lastFrame()).toContain('ACTIVITY');
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
    expect(frame).toContain('ALL TASKS');
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
    expect(lastFrame()).toContain('ACTIVITY');
    await press(stdin, ESC);
    await settle(100);
    expect(lastFrame()).toContain('MY WORK');
  });
});
