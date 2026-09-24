import { z } from 'zod';
import type { Repositories, TaskPatch } from '../../data/repositories.js';
import type { ActivityEvent } from '../../domain/activity.js';
import type { ProjectRef, UserRef } from '../../domain/entities.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import {
  compareByUrgency,
  formatTaskRef,
  isClosed,
  parseTaskRef,
  suggestBranchName,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type Task,
} from '../../domain/task.js';
import { planStatusChange } from '../../domain/workflow.js';
import { filterToQuery, type TaskFilter } from '../filters.js';
import { buildTimeline } from '../timeline.js';
import type { Session, TaskDetails, TaskView } from '../types.js';
import { optionalText, parseInput } from '../validation.js';

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'A task needs a title.' })
  .max(200, { error: 'Keep the title under 200 characters.' });

const createTaskSchema = z.object({
  title: titleSchema,
  description: optionalText(10_000),
  projectId: z.string().nullable().optional(),
  type: z.enum(TASK_TYPES).default('feature'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  status: z.enum(TASK_STATUSES).default('todo'),
  /** Omitted means "me"; null means unassigned. */
  assigneeId: z.string().nullable().optional(),
  requester: optionalText(80),
});

const changesSchema = z.object({
  title: titleSchema.optional(),
  description: optionalText(10_000),
  projectId: z.string().nullable().optional(),
  type: z.enum(TASK_TYPES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: z.string().nullable().optional(),
  requester: optionalText(80),
});

const commentSchema = z
  .string()
  .trim()
  .min(1, { error: 'The comment is empty.' })
  .max(10_000, { error: 'Keep comments under 10,000 characters.' });

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type TaskChanges = z.input<typeof changesSchema>;

/** A task reference as typed by people (`SOJA-12`, `12`) or an already loaded task. */
export type TaskTarget = string | number | Pick<Task, 'id'>;

export class TaskService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(session: Session, filter: TaskFilter, options: { projectId?: string } = {}): Promise<TaskView[]> {
    const query = { ...filterToQuery(session, filter), ...options };
    const tasks = await this.repos.tasks.list(query);
    return this.present(session, tasks.sort(compareByUrgency));
  }

  /** Title substring or task number (`SOJA-12`, `12`), across open and closed tasks. */
  async search(session: Session, text: string, limit = 50): Promise<TaskView[]> {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const exact = parseTaskRef(trimmed);
    const tasks = await this.repos.tasks.list({
      workspaceId: session.workspace.id,
      search: { text: trimmed, number: exact },
      limit,
    });
    // An exact ID hit goes first; the rest keep newest-first order.
    tasks.sort((a, b) => Number(b.number === exact) - Number(a.number === exact));
    return this.present(session, tasks);
  }

  async get(session: Session, target: TaskTarget): Promise<TaskDetails> {
    const task = await this.resolve(session, target);
    const [view, activity, comments, projects] = await Promise.all([
      this.presentOne(session, task),
      this.repos.activity.listByTask(task.id),
      this.repos.comments.listByTask(task.id),
      this.repos.projects.listByWorkspace(session.workspace.id),
    ]);

    const userIds = new Set<string>([task.creatorId]);
    for (const item of activity) {
      if (item.userId) userIds.add(item.userId);
      if (item.type === 'assigned') {
        userIds.add(item.metadata.to);
        if (item.metadata.from) userIds.add(item.metadata.from);
      }
      if (item.type === 'unassigned') userIds.add(item.metadata.from);
    }
    for (const comment of comments) userIds.add(comment.userId);
    const users = new Map((await this.repos.users.findByIds([...userIds])).map((user) => [user.id, toUserRef(user)]));

    return {
      ...view,
      creator: users.get(task.creatorId) ?? null,
      timeline: buildTimeline(activity, comments, {
        users,
        projects: new Map(projects.map((project) => [project.id, toProjectRef(project)])),
      }),
      suggestedBranch: suggestBranchName(task),
    };
  }

  async create(session: Session, input: CreateTaskInput): Promise<TaskView> {
    const data = parseInput(createTaskSchema, input);
    const assigneeId = data.assigneeId === undefined ? session.user.id : data.assigneeId;
    const projectId = data.projectId ?? null;
    await this.assertProject(session, projectId);
    await this.assertMember(session, assigneeId);

    const now = this.clock();
    const task = await this.repos.transaction(async () => {
      const created = await this.repos.tasks.create({
        workspaceId: session.workspace.id,
        projectId,
        title: data.title,
        description: data.description ?? null,
        type: data.type,
        priority: data.priority,
        status: data.status,
        assigneeId,
        creatorId: session.user.id,
        requester: data.requester ?? null,
        branch: null,
        startedAt: data.status === 'in_progress' ? now : null,
        completedAt: data.status === 'done' ? now : null,
      });
      await this.repos.activity.record(created.id, session.user.id, { type: 'task_created', metadata: {} });
      return created;
    });
    return this.presentOne(session, task);
  }

  /**
   * Applies any combination of edits. Each real change is written as its own
   * activity entry, so the timeline reads like a log of decisions.
   */
  async update(session: Session, target: TaskTarget, changes: TaskChanges): Promise<TaskView> {
    const data = parseInput(changesSchema, changes);
    const task = await this.resolve(session, target);
    if (data.projectId !== undefined) await this.assertProject(session, data.projectId);
    if (data.assigneeId !== undefined) await this.assertMember(session, data.assigneeId);

    const patch: TaskPatch = {};
    const events: ActivityEvent[] = [];
    const changed = <T>(next: T | undefined, current: T): next is T => next !== undefined && next !== current;

    if (changed(data.title, task.title)) {
      patch.title = data.title;
      events.push({ type: 'task_updated', metadata: { field: 'title', from: task.title, to: data.title } });
    }
    if (changed(data.description, task.description)) {
      patch.description = data.description;
      // Descriptions can be long; the timeline only records that it changed.
      const to = data.description ? 'edited' : null;
      events.push({ type: 'task_updated', metadata: { field: 'description', from: null, to } });
    }
    if (changed(data.requester, task.requester)) {
      patch.requester = data.requester;
      events.push({ type: 'task_updated', metadata: { field: 'requester', from: task.requester, to: data.requester } });
    }
    if (changed(data.type, task.type)) {
      patch.type = data.type;
      events.push({ type: 'task_updated', metadata: { field: 'type', from: task.type, to: data.type } });
    }
    if (changed(data.priority, task.priority)) {
      patch.priority = data.priority;
      events.push({ type: 'priority_changed', metadata: { from: task.priority, to: data.priority } });
    }
    if (changed(data.projectId, task.projectId)) {
      patch.projectId = data.projectId;
      events.push({ type: 'project_changed', metadata: { from: task.projectId, to: data.projectId } });
    }
    if (changed(data.assigneeId, task.assigneeId)) {
      patch.assigneeId = data.assigneeId;
      if (data.assigneeId) events.push({ type: 'assigned', metadata: { from: task.assigneeId, to: data.assigneeId } });
      else if (task.assigneeId) events.push({ type: 'unassigned', metadata: { from: task.assigneeId } });
    }
    if (data.status) {
      const change = planStatusChange(task, data.status, this.clock());
      if (change) {
        Object.assign(patch, change.patch);
        events.push(change.event);
      }
    }

    if (events.length === 0) return this.presentOne(session, task);
    const updated = await this.repos.transaction(async () => {
      const result = await this.repos.tasks.update(task.id, patch);
      for (const event of events) await this.repos.activity.record(task.id, session.user.id, event);
      return result;
    });
    return this.presentOne(session, updated);
  }

  /** Take the task: assign it to me and move it to In Progress. */
  start(session: Session, target: TaskTarget): Promise<TaskView> {
    return this.update(session, target, { assigneeId: session.user.id, status: 'in_progress' });
  }

  complete(session: Session, target: TaskTarget): Promise<TaskView> {
    return this.update(session, target, { status: 'done' });
  }

  async reopen(session: Session, target: TaskTarget): Promise<TaskView> {
    const task = await this.resolve(session, target);
    if (!isClosed(task.status)) {
      throw new ValidationError(`${formatTaskRef(task.number)} is already open.`);
    }
    return this.update(session, task, { status: 'todo' });
  }

  async comment(session: Session, target: TaskTarget, body: string): Promise<void> {
    const text = parseInput(commentSchema, body);
    const task = await this.resolve(session, target);
    await this.repos.transaction(async () => {
      const comment = await this.repos.comments.create({ taskId: task.id, userId: session.user.id, body: text });
      await this.repos.activity.record(task.id, session.user.id, {
        type: 'comment_added',
        metadata: { commentId: comment.id },
      });
      // Commenting counts as touching the task.
      await this.repos.tasks.update(task.id, {});
    });
  }

  /** Requesters used before in this workspace, most frequent first. Feeds autocomplete. */
  async knownRequesters(session: Session): Promise<string[]> {
    const tasks = await this.repos.tasks.list({ workspaceId: session.workspace.id });
    const counts = new Map<string, number>();
    for (const task of tasks) if (task.requester) counts.set(task.requester, (counts.get(task.requester) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }

  private async resolve(session: Session, target: TaskTarget): Promise<Task> {
    if (typeof target === 'object') {
      const task = await this.repos.tasks.findById(target.id);
      if (task && task.workspaceId === session.workspace.id) return task;
      throw new NotFoundError('That task no longer exists.');
    }
    const number = typeof target === 'number' ? target : parseTaskRef(target);
    if (number === null) {
      throw new ValidationError(`“${String(target)}” is not a task ID.`, { hint: 'Use something like SOJA-12.' });
    }
    const task = await this.repos.tasks.findByNumber(session.workspace.id, number);
    if (!task) throw new NotFoundError(`${formatTaskRef(number)} does not exist in ${session.workspace.name}.`);
    return task;
  }

  private async assertProject(session: Session, projectId: string | null): Promise<void> {
    if (projectId === null) return;
    const project = await this.repos.projects.findById(projectId);
    if (!project || project.workspaceId !== session.workspace.id) {
      throw new NotFoundError('That project does not exist in this workspace.');
    }
  }

  private async assertMember(session: Session, userId: string | null): Promise<void> {
    if (userId === null) return;
    if (!(await this.repos.workspaces.findMember(session.workspace.id, userId))) {
      throw new ValidationError(`Only members of ${session.workspace.name} can be assigned.`);
    }
  }

  private async presentOne(session: Session, task: Task): Promise<TaskView> {
    return (await this.presenter(session, [task]))(task);
  }

  private async present(session: Session, tasks: Task[]): Promise<TaskView[]> {
    if (tasks.length === 0) return [];
    return tasks.map(await this.presenter(session, tasks));
  }

  /** Loads the projects and assignees `tasks` reference, and returns a mapper to views. */
  private async presenter(session: Session, tasks: readonly Task[]): Promise<(task: Task) => TaskView> {
    const assigneeIds = [...new Set(tasks.flatMap((task) => (task.assigneeId ? [task.assigneeId] : [])))];
    const [projects, users] = await Promise.all([
      this.repos.projects.listByWorkspace(session.workspace.id),
      this.repos.users.findByIds(assigneeIds),
    ]);
    const projectById = new Map(projects.map((project) => [project.id, toProjectRef(project)]));
    const userById = new Map(users.map((user) => [user.id, toUserRef(user)]));
    return (task) => ({
      ...task,
      ref: formatTaskRef(task.number),
      project: task.projectId ? (projectById.get(task.projectId) ?? null) : null,
      assignee: task.assigneeId ? (userById.get(task.assigneeId) ?? null) : null,
    });
  }
}

function toUserRef(user: UserRef): UserRef {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

function toProjectRef(project: ProjectRef): ProjectRef {
  return { id: project.id, name: project.name, key: project.key };
}
