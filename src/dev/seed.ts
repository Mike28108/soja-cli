import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { ConflictError } from '../domain/errors.js';
import type { TaskPriority, TaskStatus, TaskType } from '../domain/task.js';

const WORKSPACE = 'Bravos Development';

const DEVELOPERS = [
  { username: 'michael', displayName: 'Michael' },
  { username: 'angel', displayName: 'Angel' },
  { username: 'freddy', displayName: 'Freddy' },
];

const PROJECTS = [
  { name: 'EnrollBridge', key: 'ENROLL', description: 'Enrollment and payments platform' },
  { name: 'SPRING', key: 'SPRING', description: 'Player development and pitching analytics' },
  { name: 'Taskfeeds', key: 'TASK', description: 'Internal content and video feeds' },
  { name: 'Banana Gym', key: 'GYM', description: 'Gym access control and memberships' },
  { name: 'Mediacore', key: 'MEDIA', description: 'Media storage and processing' },
];

interface DemoTask {
  title: string;
  project: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  /** `me` is whoever runs the seed, so "My work" is never empty. */
  assignee: 'me' | 'angel' | 'freddy' | null;
  requester?: string;
  description?: string;
  comments?: string[];
}

const TASKS: DemoTask[] = [
  { title: 'Receipt upload not rendering after payment', project: 'EnrollBridge', type: 'bug', priority: 'urgent', status: 'in_progress', assignee: 'me', requester: 'Admissions', description: 'Parents upload the receipt, the upload succeeds, but the enrollment page keeps showing "pending receipt".', comments: ['Reproduced on staging with a PDF over 5 MB.', 'The CDN URL is signed with the wrong bucket.'] },
  { title: 'Fix Stripe webhook duplicate events', project: 'EnrollBridge', type: 'bug', priority: 'high', status: 'review', assignee: 'me', requester: 'Finance', description: 'Stripe retries are creating duplicate payment records. We need idempotency on event IDs.' },
  { title: 'Add pitch velocity to player profile', project: 'SPRING', type: 'feature', priority: 'high', status: 'todo', assignee: 'me', requester: 'Baseball Operations' },
  { title: 'Improve video loading on slow connections', project: 'Taskfeeds', type: 'improvement', priority: 'low', status: 'todo', assignee: 'me', requester: 'Marketing' },
  { title: 'Turnstile loses connection every night', project: 'Banana Gym', type: 'bug', priority: 'high', status: 'blocked', assignee: 'me', requester: 'Operations', comments: ['Waiting on the vendor to send the new firmware.'] },
  { title: 'Change payment flow to support installments', project: 'EnrollBridge', type: 'feature', priority: 'medium', status: 'backlog', assignee: null, requester: 'Finance' },
  { title: 'Rotate S3 credentials', project: 'Mediacore', type: 'infra', priority: 'medium', status: 'todo', assignee: 'freddy' },
  { title: 'Migrate thumbnails to WebP', project: 'Mediacore', type: 'improvement', priority: 'low', status: 'in_progress', assignee: 'freddy' },
  { title: 'Spin rate chart shows wrong units', project: 'SPRING', type: 'bug', priority: 'medium', status: 'review', assignee: 'angel', requester: 'Baseball Operations' },
  { title: 'Research pose estimation libraries', project: 'SPRING', type: 'research', priority: 'none', status: 'backlog', assignee: 'angel' },
  { title: 'Marketing banner copy fix on feed header', project: 'Taskfeeds', type: 'chore', priority: 'low', status: 'done', assignee: 'angel', requester: 'Marketing' },
  { title: 'Refactor membership renewal job', project: 'Banana Gym', type: 'refactor', priority: 'medium', status: 'todo', assignee: 'angel' },
  { title: 'Weekly database backup verification', project: 'Mediacore', type: 'maintenance', priority: 'medium', status: 'done', assignee: 'me' },
  { title: 'Admissions export times out', project: 'EnrollBridge', type: 'bug', priority: 'high', status: 'todo', assignee: 'freddy', requester: 'Admissions' },
  { title: 'Upgrade Node to 24 on all services', project: 'Mediacore', type: 'infra', priority: 'low', status: 'cancelled', assignee: null, requester: 'Management' },
];

export interface SeedResult {
  session: Session;
  projects: number;
  tasks: number;
}

/**
 * Demo data for trying the UI. Goes through the services, so the rows,
 * numbering and activity timelines are exactly what real usage produces.
 */
export async function seedDemoData(services: AppServices): Promise<SeedResult> {
  let session = await services.session.current();
  if (!session) {
    session = await services.session.setup({ displayName: 'Michael', username: 'michael', workspaceName: WORKSPACE });
  } else {
    const existing = (await services.workspaces.list(session.user)).find((workspace) => workspace.name === WORKSPACE);
    const workspace = existing ?? (await services.workspaces.create(session.user, { name: WORKSPACE }));
    session = await services.workspaces.switchTo(session.user, workspace.id);
  }

  if ((await services.projects.list(session)).length > 0) {
    throw new ConflictError(`${WORKSPACE} already has projects, so demo data was not added.`, {
      hint: 'Run `npm run db:reset` first for a clean demo.',
    });
  }

  const members = new Map((await services.workspaces.members(session)).map((member) => [member.username, member.id]));
  for (const developer of DEVELOPERS) {
    if (!members.has(developer.username)) {
      const user = await services.workspaces.addMember(session, developer);
      members.set(user.username, user.id);
    }
  }

  const projectIds = new Map<string, string>();
  for (const project of PROJECTS) {
    projectIds.set(project.name, (await services.projects.create(session, project)).id);
  }

  for (const demo of TASKS) {
    const assigneeId = demo.assignee === 'me' ? session.user.id : demo.assignee ? members.get(demo.assignee) : null;
    // Created as Todo and then moved, so the timeline shows real transitions.
    const task = await services.tasks.create(session, {
      title: demo.title,
      description: demo.description ?? null,
      projectId: projectIds.get(demo.project) ?? null,
      type: demo.type,
      priority: demo.priority,
      status: demo.status === 'backlog' ? 'backlog' : 'todo',
      assigneeId: assigneeId ?? null,
      requester: demo.requester ?? null,
    });
    if (['review', 'blocked', 'done'].includes(demo.status)) {
      await services.tasks.update(session, task, { status: 'in_progress' });
    }
    if (demo.status !== task.status) await services.tasks.update(session, task, { status: demo.status });
    for (const comment of demo.comments ?? []) await services.tasks.comment(session, task, comment);
  }

  return { session, projects: PROJECTS.length, tasks: TASKS.length };
}
