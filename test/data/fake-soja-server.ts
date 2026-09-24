import { randomUUID } from 'node:crypto';

/**
 * In-memory stand-in for soja-backend's sync endpoints (/me, /ops, /changes,
 * task details, members, projects), following docs/SYNC.md. Just enough
 * server rules to exercise the client's sync engine: numbering, idempotency,
 * per-field conflicts and rejections.
 */
export class FakeSojaServer {
  online = true;
  failNextWith: number | null = null;
  /** Makes only /ops answer with this status (the rest of the API keeps working). */
  opsFailWith: number | null = null;
  /** Rejects the next operation with this error code. */
  rejectNext: string | null = null;
  readonly workspace = { id: randomUUID(), name: 'Bravos', slug: 'bravos', description: null, createdAt: iso(), updatedAt: iso() };
  readonly users = new Map<string, { id: string; username: string; displayName: string; email: null; createdAt: string; updatedAt: string }>();
  readonly tasks = new Map<string, Record<string, unknown>>();
  readonly comments = new Map<string, Record<string, unknown>>();
  readonly activity: Record<string, unknown>[] = [];
  readonly projects = new Map<string, Record<string, unknown>>();
  private readonly applied = new Map<string, unknown>();
  private readonly feed: { seq: number; entity: string; id: string }[] = [];
  private seq = 0;
  private number = 0;
  opRequests = 0;

  addUser(username: string): string {
    const id = randomUUID();
    this.users.set(id, { id, username, displayName: username[0]?.toUpperCase() + username.slice(1), email: null, createdAt: iso(), updatedAt: iso() });
    this.log('member', id);
    return id;
  }

  tokenFor(userId: string): string {
    return `soja_fake_token_for_${userId}`;
  }

  /** A change made by someone else directly on the server. */
  serverChange(taskId: string, fields: Record<string, unknown>, by: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('no task');
    Object.assign(task, fields, { updatedAt: iso() });
    for (const [field, to] of Object.entries(fields)) this.addActivity(taskId, by, 'task_updated', { field, from: null, to });
    this.log('task', taskId);
  }

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (!this.online) throw new TypeError('fetch failed');
    if (this.failNextWith) {
      const status = this.failNextWith;
      this.failNextWith = null;
      return json({ error: { code: 'internal', message: 'boom' } }, status);
    }
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    const userId = auth.replace('Bearer soja_fake_token_for_', '');
    const me = this.users.get(userId);
    if (!me) return json({ error: { code: 'invalid_token', message: 'Your session expired.' } }, 401);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const ws = `/v1/workspaces/${this.workspace.id}`;
    const path = url.pathname;

    if (path === '/v1/me') return json({ user: me, workspaces: [{ ...this.workspace, role: 'owner' }] });
    if (path === `${ws}/ops` && this.opsFailWith) return json({ error: { code: 'internal', message: 'Server trouble.' } }, this.opsFailWith);
    if (path === `${ws}/ops`) return json({ results: (body.ops as Op[]).map((op) => this.apply(op, userId)) });
    if (path === `${ws}/changes`) return json(this.changes(Number(url.searchParams.get('after') ?? 0), Number(url.searchParams.get('limit') ?? 500)));
    if (path === `${ws}/members` && init?.method === 'POST') {
      const user = [...this.users.values()].find((candidate) => candidate.username === body.username);
      return user ? json({ ...user, role: 'member' }, 201) : json({ error: { code: 'user_not_found', message: 'Not found' } }, 404);
    }
    if (path === `${ws}/projects` && init?.method === 'POST') {
      const project = { id: randomUUID(), workspaceId: this.workspace.id, name: body.name, key: String(body.name).slice(0, 4).toUpperCase(), description: null, repositoryUrl: null, createdAt: iso(), updatedAt: iso() };
      this.projects.set(project.id, project);
      this.log('project', project.id);
      return json(project, 201);
    }
    const detail = new RegExp(`^${ws}/tasks/SOJA-(\\d+)$`).exec(path);
    if (detail) {
      const task = [...this.tasks.values()].find((candidate) => candidate.number === Number(detail[1]));
      if (!task) return json({ error: { code: 'task_not_found', message: 'Not found' } }, 404);
      return json({ task: this.view(task), comments: [...this.comments.values()].filter((c) => c.taskId === task.id), activity: this.activity.filter((a) => a.taskId === task.id) });
    }
    return json({ error: { code: 'not_found', message: `No route ${path}` } }, 404);
  }) as typeof fetch;

  private apply(op: Op, userId: string): unknown {
    this.opRequests += 1;
    const previous = this.applied.get(op.opId);
    if (previous) return previous;
    let result: unknown;
    const reject = (code: string, message: string) => ({ opId: op.opId, status: 'rejected', error: { code, message } });
    if (this.rejectNext) {
      result = reject(this.rejectNext, 'Rejected by the server.');
      this.rejectNext = null;
    } else if (op.type === 'task.create') {
      if (this.tasks.has(op.taskId)) result = reject('id_taken', 'A task with this id already exists.');
      else if (!String(op.payload.title ?? '').trim()) result = reject('invalid_input', 'title: A task needs a title.');
      else {
        const task = {
          id: op.taskId, number: (this.number += 1), workspaceId: this.workspace.id, projectId: op.payload.projectId ?? null,
          title: String(op.payload.title).trim(), description: null, type: op.payload.type ?? 'feature', priority: op.payload.priority ?? 'medium',
          status: op.payload.status ?? 'todo', assigneeId: op.payload.assigneeId === undefined ? userId : op.payload.assigneeId, creatorId: userId,
          requester: op.payload.requester ?? null, branch: null, baseBranch: null, branchStart: null,
          createdAt: op.occurredAt, updatedAt: iso(), startedAt: null, completedAt: null,
        };
        this.tasks.set(task.id, task);
        this.addActivity(task.id, userId, 'task_created', {}, op.occurredAt);
        this.log('task', task.id);
        result = { opId: op.opId, status: 'applied', task: this.view(task), conflicts: [] };
      }
    } else {
      const task = this.tasks.get(op.taskId);
      if (!task) result = reject('task_not_found', 'That task does not exist in this workspace.');
      else if (op.type === 'task.change') {
        const conflicts = Object.keys(op.payload)
          .filter((field) => op.base && field in op.base && task[field] !== op.base[field] && task[field] !== op.payload[field])
          .map((field) => ({ field, overwritten: task[field], at: task.updatedAt }));
        for (const [field, to] of Object.entries(op.payload)) {
          if (task[field] !== to) this.addActivity(task.id as string, userId, field === 'priority' ? 'priority_changed' : 'task_updated', { field, from: task[field], to }, op.occurredAt);
        }
        Object.assign(task, op.payload, { updatedAt: iso() });
        this.log('task', task.id as string);
        result = { opId: op.opId, status: 'applied', task: this.view(task), conflicts };
      } else if (op.type === 'task.comment') {
        const id = String(op.payload.commentId);
        if (!this.comments.has(id)) {
          this.comments.set(id, { id, taskId: task.id, userId, body: op.payload.body, createdAt: op.occurredAt, updatedAt: op.occurredAt });
          this.addActivity(task.id as string, userId, 'comment_added', { commentId: id }, op.occurredAt);
          this.log('comment', id);
        }
        result = { opId: op.opId, status: 'applied', task: this.view(task), conflicts: [] };
      } else {
        result = { opId: op.opId, status: 'applied', task: this.view(task), conflicts: [] };
      }
    }
    this.applied.set(op.opId, result);
    return result;
  }

  private changes(after: number, limit: number) {
    const page = this.feed.filter((entry) => entry.seq > after).slice(0, limit + 1);
    const hasMore = page.length > limit;
    const slice = page.slice(0, limit);
    const ids = (entity: string) => new Set(slice.filter((entry) => entry.entity === entity).map((entry) => entry.id));
    return {
      cursor: slice.at(-1)?.seq ?? after,
      hasMore,
      tasks: [...this.tasks.values()].filter((task) => ids('task').has(task.id as string)).map((task) => this.view(task)),
      comments: [...this.comments.values()].filter((comment) => ids('comment').has(comment.id as string)),
      activity: this.activity.filter((item) => ids('activity').has(item.id as string)),
      projects: [...this.projects.values()].filter((project) => ids('project').has(project.id as string)),
      members: [...this.users.values()].filter((user) => ids('member').has(user.id)).map((user) => ({ ...user, role: 'member' })),
    };
  }

  private view(task: Record<string, unknown>) {
    const assignee = task.assigneeId ? this.users.get(task.assigneeId as string) : null;
    return { ...task, ref: `SOJA-${task.number as number}`, project: null, assignee: assignee ? { id: assignee.id, username: assignee.username, displayName: assignee.displayName } : null };
  }

  private addActivity(taskId: string, userId: string, type: string, metadata: object, at: string = iso()): void {
    const item = { id: randomUUID(), taskId, userId, type, metadata, createdAt: at };
    this.activity.push(item);
    this.log('activity', item.id);
  }

  private log(entity: string, id: string): void {
    this.feed.push({ seq: (this.seq += 1), entity, id });
  }
}

interface Op {
  opId: string;
  type: string;
  taskId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  base?: Record<string, unknown>;
}

function iso(): string {
  return new Date().toISOString();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
