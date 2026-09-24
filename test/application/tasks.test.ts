import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createSetUpApp, type TestApp } from '../helpers.js';

let app: TestApp & { session: Session };
beforeEach(async () => {
  app = await createSetUpApp();
});
afterEach(() => app.close());

const texts = (timeline: { kind: string; text?: string; body?: string }[]) =>
  timeline.map((entry) => (entry.kind === 'event' ? entry.text : `💬 ${entry.body}`));

describe('creating tasks', () => {
  it('needs only a title and defaults to me, Todo, Feature, Medium', async () => {
    const task = await app.services.tasks.create(app.session, { title: '  Fix Stripe webhook  ' });
    expect(task).toMatchObject({
      ref: 'SOJA-1',
      title: 'Fix Stripe webhook',
      status: 'todo',
      type: 'feature',
      priority: 'medium',
      assigneeId: app.session.user.id,
      creatorId: app.session.user.id,
      requester: null,
      project: null,
    });
    expect(task.assignee?.username).toBe('michael');
  });

  it('numbers tasks sequentially per workspace', async () => {
    const { tasks, workspaces } = app.services;
    await tasks.create(app.session, { title: 'one' });
    expect((await tasks.create(app.session, { title: 'two' })).ref).toBe('SOJA-2');

    const other = await workspaces.create(app.session.user, { name: 'Personal' });
    const personal = { ...app.session, workspace: other };
    expect((await tasks.create(personal, { title: 'first elsewhere' })).ref).toBe('SOJA-1');
  });

  it('stores every optional field', async () => {
    const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
    const task = await app.services.tasks.create(app.session, {
      title: 'Receipt not loading',
      description: 'Upload succeeds but the receipt never renders.',
      projectId: project.id,
      type: 'bug',
      priority: 'urgent',
      assigneeId: null,
      requester: 'Finance',
    });
    expect(task).toMatchObject({ type: 'bug', priority: 'urgent', assignee: null, requester: 'Finance' });
    expect(task.project).toEqual({ id: project.id, name: 'EnrollBridge', key: 'ENROLL' });
  });

  it('validates input', async () => {
    await expect(app.services.tasks.create(app.session, { title: '   ' })).rejects.toThrow('title: A task needs a title.');
    await expect(app.services.tasks.create(app.session, { title: 'x', assigneeId: 'ghost' })).rejects.toThrow(
      ValidationError,
    );
    await expect(app.services.tasks.create(app.session, { title: 'x', projectId: 'ghost' })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('editing tasks', () => {
  it('records one activity entry per real change', async () => {
    const { tasks, projects, workspaces } = app.services;
    const angel = await workspaces.addMember(app.session, { username: 'angel', displayName: 'Angel' });
    const spring = await projects.create(app.session, { name: 'SPRING' });
    await tasks.create(app.session, { title: 'Add pitch velocity' });

    const updated = await tasks.update(app.session, 'SOJA-1', {
      title: 'Add pitch velocity chart',
      priority: 'high',
      projectId: spring.id,
      assigneeId: angel.id,
      requester: 'Baseball Operations',
      type: 'feature', // unchanged: no entry
    });
    expect(updated).toMatchObject({ priority: 'high', requester: 'Baseball Operations', assigneeId: angel.id });

    const details = await tasks.get(app.session, 'soja-1');
    expect(texts(details.timeline)).toEqual([
      'created the task',
      'renamed it to “Add pitch velocity chart”',
      'set requester to Baseball Operations',
      'set priority MED → HIGH',
      'moved it to SPRING',
      'reassigned @michael → @angel',
    ]);
  });

  it('is a no-op when nothing changes', async () => {
    const task = await app.services.tasks.create(app.session, { title: 'Same' });
    await app.services.tasks.update(app.session, task, { title: 'Same', priority: 'medium' });
    expect((await app.services.tasks.get(app.session, 1)).timeline).toHaveLength(1);
  });

  it('unassigns and clears optional fields', async () => {
    await app.services.tasks.create(app.session, { title: 't', requester: 'Marketing', description: 'long' });
    const task = await app.services.tasks.update(app.session, 1, { assigneeId: null, requester: '', description: null });
    expect(task).toMatchObject({ assignee: null, requester: null, description: null });
    const { timeline } = await app.services.tasks.get(app.session, 1);
    expect(texts(timeline).slice(1)).toEqual(['cleared the description', 'cleared the requester', 'unassigned @michael']);
  });
});

describe('status transitions', () => {
  it('start assigns me and moves to In Progress', async () => {
    await app.services.tasks.create(app.session, { title: 't', assigneeId: null });
    const started = await app.services.tasks.start(app.session, 'SOJA-1');
    expect(started.status).toBe('in_progress');
    expect(started.assigneeId).toBe(app.session.user.id);
    expect(started.startedAt).toBeInstanceOf(Date);
  });

  it('complete and reopen keep timestamps and timeline consistent', async () => {
    const { tasks } = app.services;
    await tasks.create(app.session, { title: 't' });
    const done = await tasks.complete(app.session, 'SOJA-1');
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeInstanceOf(Date);

    const reopened = await tasks.reopen(app.session, 'SOJA-1');
    expect(reopened.status).toBe('todo');
    expect(reopened.completedAt).toBeNull();
    await expect(tasks.reopen(app.session, 'SOJA-1')).rejects.toThrow('SOJA-1 is already open.');

    const { timeline } = await tasks.get(app.session, 'SOJA-1');
    expect(texts(timeline)).toEqual(['created the task', 'completed it · Todo → Done', 'reopened it · Done → Todo']);
  });

  it('reports unknown and malformed references clearly', async () => {
    await expect(app.services.tasks.get(app.session, 'SOJA-99')).rejects.toThrow(
      'SOJA-99 does not exist in Bravos Development.',
    );
    await expect(app.services.tasks.get(app.session, 'banana')).rejects.toThrow('“banana” is not a task ID.');
  });
});

describe('comments and timeline', () => {
  it('interleaves comments with activity in order', async () => {
    const { tasks } = app.services;
    await tasks.create(app.session, { title: 't' });
    await tasks.comment(app.session, 'SOJA-1', 'Looking into it');
    await tasks.update(app.session, 'SOJA-1', { status: 'in_progress' });
    await tasks.comment(app.session, 'SOJA-1', 'Found it: duplicate events');
    await expect(tasks.comment(app.session, 'SOJA-1', '  ')).rejects.toThrow(ValidationError);

    const details = await tasks.get(app.session, 'SOJA-1');
    expect(texts(details.timeline)).toEqual([
      'created the task',
      '💬 Looking into it',
      'moved Todo → In Progress',
      '💬 Found it: duplicate events',
    ]);
    expect(details.timeline.every((entry) => entry.actor?.username === 'michael')).toBe(true);
    expect(details.creator?.username).toBe('michael');
    expect(details.suggestedBranch).toBe('feat/SOJA-1-t');
  });
});

describe('filters', () => {
  beforeEach(async () => {
    const { tasks, workspaces } = app.services;
    const angel = await workspaces.addMember(app.session, { username: 'angel' });
    await tasks.create(app.session, { title: 'mine todo', priority: 'low' });
    await tasks.create(app.session, { title: 'mine urgent', priority: 'urgent' });
    await tasks.create(app.session, { title: 'mine in progress', status: 'in_progress' });
    await tasks.create(app.session, { title: 'mine done', status: 'done' });
    await tasks.create(app.session, { title: 'angel review', status: 'review', assigneeId: angel.id });
    await tasks.create(app.session, { title: 'angel blocked', status: 'blocked', assigneeId: angel.id });
    await tasks.create(app.session, { title: 'nobody backlog', status: 'backlog', assigneeId: null });
  });

  const titles = async (filter: Parameters<TestApp['services']['tasks']['list']>[1]) =>
    (await app.services.tasks.list(app.session, filter)).map((task) => task.title);

  it('my tasks: open work assigned to me, most urgent first', async () => {
    expect(await titles('mine')).toEqual(['mine in progress', 'mine urgent', 'mine todo']);
  });

  it('all tasks: every open task in the workspace', async () => {
    expect(await titles('all')).toEqual([
      'mine in progress',
      'angel review',
      'angel blocked',
      'mine urgent',
      'mine todo',
      'nobody backlog',
    ]);
  });

  it('status filters span every assignee', async () => {
    expect(await titles('review')).toEqual(['angel review']);
    expect(await titles('blocked')).toEqual(['angel blocked']);
    expect(await titles('done')).toEqual(['mine done']);
    expect(await titles('todo')).toEqual(['mine urgent', 'mine todo']);
  });

  it('can be scoped to a project', async () => {
    const project = await app.services.projects.create(app.session, { name: 'Taskfeeds' });
    await app.services.tasks.update(app.session, 'SOJA-1', { projectId: project.id });
    const scoped = await app.services.tasks.list(app.session, 'all', { projectId: project.id });
    expect(scoped.map((task) => task.ref)).toEqual(['SOJA-1']);
  });
});

describe('search', () => {
  beforeEach(async () => {
    const { tasks } = app.services;
    await tasks.create(app.session, { title: 'Fix Stripe webhook duplicate events' });
    await tasks.create(app.session, { title: 'Stripe checkout mobile issue', status: 'done' });
    await tasks.create(app.session, { title: 'Improve video viewer' });
    await tasks.create(app.session, { title: '100% width_banner' });
  });

  it('matches titles case-insensitively, including closed tasks', async () => {
    const results = await app.services.tasks.search(app.session, 'stripe');
    expect(results.map((task) => task.ref)).toEqual(['SOJA-2', 'SOJA-1']);
  });

  it('matches task IDs and ranks the exact hit first', async () => {
    expect((await app.services.tasks.search(app.session, 'SOJA-3')).map((task) => task.ref)).toEqual(['SOJA-3']);
    expect((await app.services.tasks.search(app.session, '3'))[0]?.ref).toBe('SOJA-3');
  });

  it('treats LIKE wildcards literally', async () => {
    expect((await app.services.tasks.search(app.session, '100%')).map((t) => t.ref)).toEqual(['SOJA-4']);
    expect(await app.services.tasks.search(app.session, 'k_d')).toHaveLength(0);
    expect(await app.services.tasks.search(app.session, '   ')).toEqual([]);
  });
});

describe('workspace isolation', () => {
  it('never leaks tasks across workspaces', async () => {
    await app.services.tasks.create(app.session, { title: 'secret' });
    const other = await app.services.workspaces.create(app.session.user, { name: 'Personal' });
    const personal = { ...app.session, workspace: other };
    expect(await app.services.tasks.list(personal, 'all')).toEqual([]);
    expect(await app.services.tasks.search(personal, 'secret')).toEqual([]);
    await expect(app.services.tasks.get(personal, 'SOJA-1')).rejects.toThrow(NotFoundError);
  });
});

describe('requesters', () => {
  it('lists known requesters by frequency', async () => {
    const { tasks } = app.services;
    await tasks.create(app.session, { title: 'a', requester: 'Finance' });
    await tasks.create(app.session, { title: 'b', requester: 'Marketing' });
    await tasks.create(app.session, { title: 'c', requester: 'Marketing' });
    expect(await tasks.knownRequesters(app.session)).toEqual(['Marketing', 'Finance']);
  });
});
