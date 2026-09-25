import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App.js';
import { createSetUpApp, tempDir, type TestApp } from '../helpers.js';

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

let app: TestApp & { session: Awaited<ReturnType<typeof createSetUpApp>>['session'] };
let ui: ReturnType<typeof render> | undefined;
let workdir: ReturnType<typeof tempDir>;
afterEach(() => {
  ui?.unmount();
  app.close();
  workdir.cleanup();
});

async function started() {
  app = await createSetUpApp();
  const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
  await app.services.tasks.create(app.session, { title: 'Fix Stripe webhook', projectId: project.id, priority: 'high' });
  await app.services.tasks.create(app.session, { title: 'Add pitch velocity', priority: 'low' });
  await app.services.tasks.create(app.session, { title: 'Blocked on vendor', status: 'blocked', assigneeId: null });
  workdir = tempDir();
  ui = render(<App services={app.services} splashMs={0} cwd={workdir.path} mouse />);
  await settle(250);
  return ui;
}

/** Where `text` first appears on screen, 0-based. */
function locate(frame: string, text: string, after = 0): { x: number; y: number } {
  const lines = frame.split('\n');
  for (let y = after; y < lines.length; y += 1) {
    const x = [...(lines[y] ?? '')].join('').indexOf(text);
    if (x >= 0) return { x: [...(lines[y] ?? '').slice(0, x)].length, y };
  }
  throw new Error(`“${text}” is not on screen:\n${frame}`);
}

/** What the terminal sends for a left click (SGR mode), 1-based. */
async function click(text: string, options: { after?: number } = {}) {
  const { x, y } = locate(ui?.lastFrame() ?? '', text, options.after);
  ui?.stdin.write(`\u001b[<0;${x + 1};${y + 1}M`);
  ui?.stdin.write(`\u001b[<0;${x + 1};${y + 1}m`);
  await settle(120);
}

async function wheel(direction: 'up' | 'down', at: string) {
  const { x, y } = locate(ui?.lastFrame() ?? '', at);
  ui?.stdin.write(`\u001b[<${direction === 'down' ? 65 : 64};${x + 1};${y + 1}M`);
  await settle(100);
}

describe('the mouse', () => {
  it('selects a task with a click and opens it with a second one', async () => {
    const { lastFrame } = await started();
    await click('Add pitch velocity');
    expect(lastFrame()).toMatch(/▌ SOJA-2/);
    await click('Add pitch velocity', { after: 3 });
    expect(lastFrame()).toContain('SOJA-2 · Feature');
    expect(lastFrame()).toContain('Activity');
  });

  it('switches views from the tabs and scrolls with the wheel', async () => {
    const { lastFrame } = await started();
    await click('6 Blocked');
    expect(lastFrame()).toContain('Blocked on vendor');
    await click('2 All');
    // Blocked sorts before Todo: the first row is SOJA-3; the wheel moves to the next one.
    expect(lastFrame()).toMatch(/▌ SOJA-3/);
    await wheel('down', 'Fix Stripe webhook');
    expect(lastFrame()).toMatch(/▌ SOJA-1/);
    await wheel('up', 'Fix Stripe webhook');
    expect(lastFrame()).toMatch(/▌ SOJA-3/);
  });

  it('changes a field from the task detail and closes windows by clicking outside', async () => {
    const { lastFrame } = await started();
    ui?.stdin.write('\r');
    await settle(200);
    await click('○ Todo');
    expect(lastFrame()).toContain('Status');
    await click('SOJA-1 · Feature'); // outside the window: closes it
    expect(lastFrame()).not.toContain('5 ⊘ Blocked');
    await click('○ Todo');
    await click('6 ✓ Done');
    expect((await app.services.tasks.get(app.session, 'SOJA-1')).status).toBe('done');
  });

  it('presses buttons in confirmations', async () => {
    const { lastFrame } = await started();
    ui?.stdin.write('\r');
    await settle(200);
    ui?.stdin.write('e');
    await settle(80);
    ui?.stdin.write('G');
    await settle(40);
    ui?.stdin.write('\r');
    await settle(120);
    expect(lastFrame()).toContain('Delete this task for good?');
    await click('Cancel');
    expect(lastFrame()).not.toContain('Delete this task for good?');
    expect((await app.services.tasks.list(app.session, 'all')).length).toBe(3);
  });

  it('never mistakes a mouse report for key presses', async () => {
    const { lastFrame } = await started();
    // Somewhere empty: nothing reacts, and no shortcut (M, ; or digits) fires.
    ui?.stdin.write('\u001b[<0;99;18M');
    ui?.stdin.write('\u001b[<0;99;18m');
    await settle(120);
    expect(lastFrame()).toContain('My work');
    expect(lastFrame()).not.toContain('New task');
  });
});
