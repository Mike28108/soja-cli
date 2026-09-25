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
  readonly channels = new Map<string, Record<string, unknown>>();
  readonly messages = new Map<string, Record<string, unknown>>();
  /** userId → channelId → lastReadSeq */
  readonly reads = new Map<string, Map<string, number>>();
  /** Answers at most this many chat messages per /ops request, leaving the rest unanswered (rate limit). */
  messageLimit: number | null = null;
  /** Connected fake WebSockets, authenticated. */
  readonly sockets = new Set<FakeSocket>();
  readonly general: string;
  private messageSeq = 0;
  private readonly applied = new Map<string, unknown>();
  private readonly feed: { seq: number; entity: string; id: string }[] = [];
  private seq = 0;
  private number = 0;
  opRequests = 0;
  /** Workspace role per user; owner unless set. */
  readonly roles = new Map<string, 'owner' | 'member'>();

  constructor() {
    this.general = this.addChannel('general');
  }

  addChannel(name: string, archived = false): string {
    const id = randomUUID();
    this.channels.set(id, { id, workspaceId: this.workspace.id, name, topic: null, createdBy: null, createdAt: iso(), updatedAt: iso(), archivedAt: archived ? iso() : null });
    this.log('channel', id);
    return id;
  }

  /** Someone else writes in the chat directly on the server; live sockets hear about it. */
  serverMessage(channelId: string, authorId: string, body: string): Record<string, unknown> {
    const message = { id: randomUUID(), seq: (this.messageSeq += 1), workspaceId: this.workspace.id, channelId, authorId, body, replyToId: null, createdAt: iso(), editedAt: null, deletedAt: null };
    this.messages.set(message.id, message);
    this.log('message', message.id);
    this.broadcast({ type: 'message.created', message });
    return message;
  }

  broadcast(event: unknown): void {
    for (const socket of this.sockets) socket.deliver(event);
  }

  /** A WebSocket class bound to this server, for `bootstrap({ WebSocket })`. */
  get WebSocket(): typeof WebSocket {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const server = this;
    return class extends FakeSocket {
      constructor(url: string | URL) {
        super(server, String(url));
      }
    } as unknown as typeof WebSocket;
  }

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

    if (path === '/v1/me') return json({ user: me, workspaces: [{ ...this.workspace, role: this.roles.get(userId) ?? 'owner' }] });
    if (path === `${ws}/ops` && this.opsFailWith) return json({ error: { code: 'internal', message: 'Server trouble.' } }, this.opsFailWith);
    if (path === `${ws}/ops`) {
      let chatBudget = this.messageLimit ?? Infinity;
      const results: unknown[] = [];
      for (const op of body.ops as Op[]) {
        if (op.type.startsWith('message.') && !this.applied.has(op.opId) && (chatBudget -= 1) < 0) break;
        results.push(this.apply(op, userId));
      }
      if (results.length) this.broadcast({ type: 'changes.available' });
      return json({ results });
    }
    if (path === `${ws}/channels` && init?.method === 'POST') {
      const name = String(body.name);
      if ([...this.channels.values()].some((channel) => channel.name === name)) return json({ error: { code: 'channel_exists', message: `#${name} already exists.` } }, 409);
      const id = this.addChannel(name);
      return json({ ...this.channels.get(id), lastReadSeq: 0 }, 201);
    }
    if (path === `${ws}/import` && init?.method === 'POST') {
      const done = this.applied.get(String(body.importId));
      if (done) return json(done);
      const members = new Map([...this.users.values()].map((user) => [user.username, user.id]));
      const users = new Map((body.users as { localId: string; username: string }[]).map((user) => [user.localId, members.get(user.username) ?? null]));
      const projectIds: Record<string, string> = {};
      for (const project of body.projects as { localId: string; name: string; key: string }[]) {
        const id = randomUUID();
        projectIds[project.localId] = id;
        this.projects.set(id, { id, workspaceId: this.workspace.id, name: project.name, key: project.key, description: null, repositoryUrl: null, createdAt: iso(), updatedAt: iso() });
        this.log('project', id);
      }
      const keep = this.tasks.size === 0;
      const renumbered: Record<string, number> = {};
      const localTasks = new Map<string, string>();
      for (const task of [...(body.tasks as Record<string, unknown>[])].sort((a, b) => (a.number as number) - (b.number as number))) {
        const number = keep ? (task.number as number) : (this.number += 1);
        if (keep) this.number = Math.max(this.number, number);
        if (number !== task.number) renumbered[String(task.number)] = number;
        const id = randomUUID();
        localTasks.set(task.localId as string, id);
        this.tasks.set(id, {
          id, number, workspaceId: this.workspace.id, projectId: task.projectLocalId ? projectIds[task.projectLocalId as string] : null,
          title: task.title, description: task.description, type: task.type, priority: task.priority, status: task.status,
          assigneeId: users.get(task.assigneeLocalId as string) ?? null, creatorId: users.get(task.creatorLocalId as string) ?? userId,
          requester: task.requester, branch: task.branch, baseBranch: task.baseBranch, branchStart: task.branchStart,
          createdAt: task.createdAt, updatedAt: task.updatedAt, startedAt: task.startedAt, completedAt: task.completedAt, archivedAt: task.archivedAt,
        });
        this.log('task', id);
      }
      for (const comment of body.comments as Record<string, unknown>[]) {
        const taskId = localTasks.get(comment.taskLocalId as string);
        if (!taskId) continue;
        const id = randomUUID();
        this.comments.set(id, { id, taskId, userId: users.get(comment.userLocalId as string) ?? userId, body: comment.body, createdAt: comment.createdAt, updatedAt: comment.updatedAt });
        this.log('comment', id);
      }
      const unmatchedUsers = (body.users as { username: string }[]).filter((user) => !members.has(user.username)).map((user) => user.username);
      const result = { projects: Object.keys(projectIds).length, tasks: localTasks.size, comments: (body.comments as unknown[]).length, activity: 0, renumbered, projectIds, unmatchedUsers };
      this.applied.set(String(body.importId), result);
      return json(result);
    }
    const channelPatch = new RegExp(`^${ws}/channels/([^/]+)$`).exec(path);
    if (channelPatch && init?.method === 'PATCH') {
      const channel = this.channels.get(channelPatch[1] ?? '');
      if (!channel) return json({ error: { code: 'channel_not_found', message: 'No such channel.' } }, 404);
      if (body.archived !== undefined) {
        if ((this.roles.get(userId) ?? 'owner') !== 'owner') return json({ error: { code: 'forbidden', message: 'Only owners can archive channels.' } }, 403);
        if (channel.name === 'general') return json({ error: { code: 'invalid_input', message: '#general cannot be archived.' } }, 400);
        channel.archivedAt = body.archived ? iso() : null;
      }
      if (body.topic !== undefined) channel.topic = body.topic;
      this.log('channel', channel.id as string);
      return json({ ...channel, lastReadSeq: 0 });
    }
    const projectPatch = new RegExp(`^${ws}/projects/([^/]+)$`).exec(path);
    if (projectPatch && init?.method === 'PATCH') {
      const project = this.projects.get(projectPatch[1] ?? '');
      if (!project) return json({ error: { code: 'project_not_found', message: 'No such project.' } }, 404);
      Object.assign(project, body, { updatedAt: iso() });
      this.log('project', project.id as string);
      return json(project);
    }
    const history = new RegExp(`^${ws}/channels/([^/]+)/messages$`).exec(path);
    if (history) {
      const before = url.searchParams.get('before');
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const rows = [...this.messages.values()]
        .filter((message) => message.channelId === history[1] && (before === null || (message.seq as number) < Number(before)))
        .sort((a, b) => (b.seq as number) - (a.seq as number))
        .slice(0, limit);
      return json(rows);
    }
    if (path === `${ws}/changes`) return json(this.changes(Number(url.searchParams.get('after') ?? 0), Number(url.searchParams.get('limit') ?? 500), userId));
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
    } else if (op.type.startsWith('message.') || op.type === 'channel.read') {
      result = this.applyChat(op, userId, reject);
    } else if (op.type === 'task.delete') {
      if ((this.roles.get(userId) ?? 'owner') !== 'owner') result = reject('owner_only', 'Only workspace owners can delete tasks.');
      else {
        this.tasks.delete(op.taskId);
        this.log('task', op.taskId);
        result = { opId: op.opId, status: 'applied', deleted: { taskId: op.taskId } };
      }
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
        if (typeof op.payload.archived === 'boolean') {
          const archived = op.payload.archived;
          delete op.payload.archived;
          if (archived !== (task.archivedAt != null)) {
            task.archivedAt = archived ? op.occurredAt : null;
            this.addActivity(task.id as string, userId, archived ? 'task_archived' : 'task_unarchived', {}, op.occurredAt);
          }
        }
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

  private applyChat(op: Op, userId: string, reject: (code: string, message: string) => unknown): unknown {
    const payload = op.payload;
    if (op.type === 'channel.read') {
      const reads = this.reads.get(userId) ?? new Map<string, number>();
      this.reads.set(userId, reads);
      const lastReadSeq = Math.max(reads.get(String(payload.channelId)) ?? 0, Number(payload.lastReadSeq));
      reads.set(String(payload.channelId), lastReadSeq);
      return { opId: op.opId, status: 'applied', read: { channelId: payload.channelId, lastReadSeq } };
    }
    const messageId = String(payload.messageId);
    if (op.type === 'message.send') {
      const channel = this.channels.get(String(payload.channelId));
      if (!channel) return reject('channel_not_found', 'That channel does not exist.');
      if (channel.archivedAt) return reject('channel_archived', `#${channel.name as string} is archived.`);
      const existing = this.messages.get(messageId);
      if (existing) return { opId: op.opId, status: 'applied', message: existing };
      const message = {
        id: messageId, seq: (this.messageSeq += 1), workspaceId: this.workspace.id, channelId: channel.id, authorId: userId,
        body: payload.body, replyToId: payload.replyToId ?? null, createdAt: op.occurredAt, editedAt: null, deletedAt: null,
      };
      this.messages.set(messageId, message);
      this.log('message', messageId);
      this.broadcast({ type: 'message.created', message });
      return { opId: op.opId, status: 'applied', message };
    }
    const message = this.messages.get(messageId);
    if (!message) return reject('message_not_found', 'That message does not exist.');
    if (message.authorId !== userId) return reject('forbidden', 'Only the author can change a message.');
    if (op.type === 'message.edit') Object.assign(message, { body: payload.body, editedAt: op.occurredAt });
    else Object.assign(message, { body: '', deletedAt: op.occurredAt });
    this.log('message', messageId);
    this.broadcast({ type: 'message.updated', message });
    return { opId: op.opId, status: 'applied', message };
  }

  private changes(after: number, limit: number, userId?: string) {
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
      members: [...this.users.values()].filter((user) => ids('member').has(user.id)).map((user) => ({ ...user, role: this.roles.get(user.id) ?? 'owner' })),
      channels: [...this.channels.values()].filter((channel) => ids('channel').has(channel.id as string)),
      messages: [...this.messages.values()].filter((message) => ids('message').has(message.id as string)),
      deletedTasks: [...ids('task')].filter((id) => !this.tasks.has(id)),
      reads: [...(this.reads.get(userId ?? '') ?? new Map<string, number>()).entries()].map(([channelId, lastReadSeq]) => ({ channelId, lastReadSeq })),
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

/** Minimal WebSocket stand-in speaking the /v1/live protocol against the fake server. */
class FakeSocket extends EventTarget {
  readyState = 0;
  sent: unknown[] = [];

  constructor(
    private readonly server: FakeSojaServer,
    readonly url: string,
  ) {
    super();
    queueMicrotask(() => {
      if (!this.server.online) return this.finish(1006);
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }

  send(data: string): void {
    const message = JSON.parse(data) as { type: string; token?: string; workspaceId?: string };
    this.sent.push(message);
    if (message.type !== 'auth') return;
    const userId = String(message.token).replace('soja_fake_token_for_', '');
    if (!this.server.users.has(userId) || message.workspaceId !== this.server.workspace.id) return this.finish(4403);
    this.server.sockets.add(this);
    this.deliver({ type: 'ready', workspaceId: message.workspaceId });
  }

  deliver(event: unknown): void {
    queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(event) })));
  }

  close(code = 1000): void {
    this.finish(code);
  }

  /** The server drops the connection (e.g. a deploy). */
  drop(): void {
    this.finish(1006);
  }

  private finish(code: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.server.sockets.delete(this);
    queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('close'), { code })));
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
