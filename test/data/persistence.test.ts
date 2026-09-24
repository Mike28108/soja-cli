import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePaths } from '../../src/config/paths.js';
import { bootstrap } from '../../src/bootstrap.js';
import { tempDir } from '../helpers.js';

describe('persistence', () => {
  let dir: ReturnType<typeof tempDir>;
  afterEach(() => dir.cleanup());

  it('restores the exact same state after closing and reopening SOJA', async () => {
    dir = tempDir();
    const paths = resolvePaths({ XDG_DATA_HOME: join(dir.path, 'data'), XDG_CONFIG_HOME: join(dir.path, 'config') });

    const first = await bootstrap({ paths });
    const session = await first.services.session.setup({ displayName: 'Michael', username: 'michael', workspaceName: 'Bravos' });
    const project = await first.services.projects.create(session, { name: 'EnrollBridge' });
    const angel = await first.services.workspaces.addMember(session, { username: 'angel' });
    await first.services.tasks.create(session, { title: 'Fix Stripe webhook', projectId: project.id, requester: 'Finance' });
    await first.services.tasks.update(session, 'SOJA-1', { priority: 'urgent', assigneeId: angel.id, status: 'review' });
    await first.services.tasks.comment(session, 'SOJA-1', 'Duplicate events confirmed');
    first.close();

    const second = await bootstrap({ paths });
    const restored = await second.services.session.current();
    if (!restored) throw new Error('expected the session to survive a restart');
    expect(restored.user.username).toBe('michael');
    expect(restored.workspace.name).toBe('Bravos');

    const task = await second.services.tasks.get(restored, 'SOJA-1');
    expect(task).toMatchObject({
      title: 'Fix Stripe webhook',
      priority: 'urgent',
      status: 'review',
      requester: 'Finance',
      project: { name: 'EnrollBridge' },
      assignee: { username: 'angel' },
    });
    expect(task.timeline.map((entry) => entry.kind)).toEqual(['event', 'event', 'event', 'event', 'comment']);
    second.close();
  });
});
