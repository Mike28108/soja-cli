import { randomUUID } from 'node:crypto';
import type { ProjectOperations, SessionOperations, TaskOperations, WorkspaceOperations } from '../../application/ports.js';
import type { ProjectService } from '../../application/services/project-service.js';
import type { TaskService } from '../../application/services/task-service.js';
import type { TaskFilter } from '../../application/filters.js';
import type { Member, ProjectSummary, Session, TaskDetails, TaskView } from '../../application/types.js';
import type { ConfigStore, RemoteSettings } from '../../config/config.js';
import type { Project, User, Workspace } from '../../domain/entities.js';
import { NotFoundError, SojaError, ValidationError } from '../../domain/errors.js';
import { isClosed, formatTaskRef, type Task } from '../../domain/task.js';
import { OfflineError, type ApiClient } from '../remote/api-client.js';
import type { Repositories, WorkspaceWithRole } from '../repositories.js';
import type { SyncEngine } from './engine.js';
import type { OpType, ReplicaStore } from './store.js';

/** Everything the replica services share: server, replica, outbox, config, and a hook to sync soon. */
export interface ReplicaContext {
  api: ApiClient;
  store: ReplicaStore;
  engine: SyncEngine;
  repos: Repositories;
  config: ConfigStore;
  /** Called after every local write: the caller decides when to sync (debounced in the TUI, at exit in the CLI). */
  onWrite: () => void;
}

function settings(context: ReplicaContext): RemoteSettings {
  const remote = context.config.load()?.remote;
  if (!remote) throw new SojaError('No SOJA server configured.', { hint: 'Run `soja login --server <url>`.' });
  return remote;
}

function saveSettings(context: ReplicaContext, patch: Partial<RemoteSettings>): void {
  const current = context.config.load();
  if (!current?.remote) throw new SojaError('No SOJA server configured.', { hint: 'Run `soja login --server <url>`.' });
  context.config.save({ ...current, remote: { ...current.remote, ...patch } });
}

/** Operations that change shared structure (projects, workspaces, members) need the server. */
async function online<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OfflineError) {
      throw new SojaError(`${what} needs a connection to the SOJA server.`, {
        hint: 'Tasks and comments work offline; projects, workspaces and members do not.',
        cause: error,
      });
    }
    throw error;
  }
}

export class ReplicaSessionService implements SessionOperations {
  constructor(private readonly context: ReplicaContext) {}

  async user(): Promise<User | null> {
    const { userId } = settings(this.context);
    const local = userId ? await this.context.repos.users.findById(userId) : null;
    return local ?? (await this.context.engine.refreshAccount()).user;
  }

  /**
   * The signed-in user and active workspace from the replica, so SOJA opens
   * offline. The first run downloads them from the server.
   */
  async current(): Promise<Session | null> {
    const remote = settings(this.context);
    let user = remote.userId ? await this.context.repos.users.findById(remote.userId) : null;
    let workspaces = user ? await this.context.repos.workspaces.listForUser(user.id) : [];

    if (!user || workspaces.length === 0) {
      const account = await this.context.engine.refreshAccount().catch((error: unknown) => {
        if (error instanceof OfflineError) {
          throw new SojaError('SOJA needs to connect once to download your workspace.', {
            hint: 'Check your connection, or use `soja mode local`.',
            cause: error,
          });
        }
        throw error;
      });
      user = account.user;
      workspaces = account.workspaces;
      saveSettings(this.context, { userId: user.id });
    }

    const workspace = workspaces.find((candidate) => candidate.id === remote.workspaceId) ?? workspaces[0];
    if (!workspace) {
      throw new SojaError(`You have no workspaces on ${this.context.api.baseUrl} yet.`, {
        hint: 'Create one with `soja workspace create "<name>"`, or ask an owner to add you.',
      });
    }
    if (workspace.id !== remote.workspaceId) saveSettings(this.context, { workspaceId: workspace.id });
    return { user, workspace };
  }

  async setup(): Promise<Session> {
    throw new SojaError('Remote mode has no local setup.', { hint: 'Sign in with `soja login --server <url>`.' });
  }
}

export class ReplicaWorkspaceService implements WorkspaceOperations {
  constructor(private readonly context: ReplicaContext) {}

  list(user: User): Promise<WorkspaceWithRole[]> {
    return this.context.repos.workspaces.listForUser(user.id);
  }

  async create(_owner: User, input: Parameters<WorkspaceOperations['create']>[1]): Promise<Workspace> {
    const workspace = await online('Creating a workspace', () => this.context.api.post<Workspace>('/v1/workspaces', input));
    await this.context.engine.refreshAccount();
    return workspace;
  }

  async switchTo(user: User, idOrSlug: string): Promise<Session> {
    let workspace = (await this.list(user)).find((candidate) => candidate.id === idOrSlug || candidate.slug === idOrSlug);
    if (!workspace) {
      const account = await online('Finding that workspace', () => this.context.engine.refreshAccount());
      workspace = account.workspaces.find((candidate) => candidate.id === idOrSlug || candidate.slug === idOrSlug);
    }
    if (!workspace) throw new NotFoundError(`You are not a member of a workspace called “${idOrSlug}”.`);
    saveSettings(this.context, { workspaceId: workspace.id });
    this.context.onWrite();
    return { user, workspace };
  }

  async members(session: Session): Promise<Member[]> {
    const members = await this.context.repos.workspaces.listMembers(session.workspace.id);
    return members.map(({ id, username, displayName, role }) => ({ id, username, displayName, role }));
  }

  async findMember(session: Session, username: string): Promise<Member> {
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    const member = (await this.members(session)).find((candidate) => candidate.username === normalized);
    if (!member) throw new NotFoundError(`@${normalized} is not a member of ${session.workspace.name}.`);
    return member;
  }

  async addMember(session: Session, input: Parameters<WorkspaceOperations['addMember']>[1]): Promise<Member> {
    const member = await online('Adding a developer', () =>
      this.context.api.post<Member>(`/v1/workspaces/${session.workspace.id}/members`, { username: input.username }),
    );
    await this.context.store.upsertMember(session.workspace.id, member);
    return member;
  }
}

export class ReplicaProjectService implements ProjectOperations {
  constructor(
    private readonly context: ReplicaContext,
    private readonly local: ProjectService,
  ) {}

  list(session: Session): Promise<ProjectSummary[]> {
    return this.local.list(session);
  }

  get(session: Session, id: string): Promise<Project> {
    return this.local.get(session, id);
  }

  resolve(session: Session, keyOrName: string): Promise<Project> {
    return this.local.resolve(session, keyOrName);
  }

  findByRepository(session: Session, path: string): Promise<Project | null> {
    return this.local.findByRepository(session, path);
  }

  async create(session: Session, input: Parameters<ProjectOperations['create']>[1]): Promise<Project> {
    const { repositoryPath, ...shared } = input;
    const project = await online('Creating a project', () =>
      this.context.api.post<Omit<Project, 'repositoryPath'>>(`/v1/workspaces/${session.workspace.id}/projects`, shared),
    );
    await this.context.store.upsertProject(project);
    const stored = await this.local.get(session, project.id);
    return repositoryPath ? this.linkRepository(session, stored, repositoryPath) : stored;
  }

  /** The folder is stored in this machine's replica only; the origin URL is shared if the project had none. */
  async linkRepository(session: Session, project: Project, path: string): Promise<Project> {
    const linked = await this.local.linkRepository(session, project, path);
    if (!project.repositoryUrl && linked.repositoryUrl) {
      await this.context.api
        .patch(`/v1/workspaces/${session.workspace.id}/projects/${project.id}`, { repositoryUrl: linked.repositoryUrl })
        .catch(() => undefined); // best effort: the URL is a convenience for teammates
    }
    return linked;
  }

  unlinkRepository(session: Session, project: Project): Promise<Project> {
    return this.local.unlinkRepository(session, project);
  }
}

type Target = Parameters<TaskOperations['get']>[1];
const CHANGE_FIELDS = ['title', 'description', 'projectId', 'type', 'priority', 'status', 'assigneeId', 'requester', 'branch', 'baseBranch', 'branchStart'] as const;

/**
 * Tasks in remote mode: read and written in the local replica (instant, works
 * offline), with every write queued as an operation for the server.
 */
export class ReplicaTaskService implements TaskOperations {
  constructor(
    private readonly context: ReplicaContext,
    private readonly local: TaskService,
  ) {}

  list(session: Session, filter: TaskFilter, options: { projectId?: string } = {}): Promise<TaskView[]> {
    return this.local.list(session, filter, options);
  }

  search(session: Session, text: string, limit?: number): Promise<TaskView[]> {
    return this.local.search(session, text, limit);
  }

  get(session: Session, target: Target): Promise<TaskDetails> {
    return this.local.get(session, target);
  }

  knownRequesters(session: Session): Promise<string[]> {
    return this.local.knownRequesters(session);
  }

  async create(session: Session, input: Parameters<TaskOperations['create']>[1]): Promise<TaskView> {
    const id = randomUUID();
    const number = await this.context.store.nextProvisionalNumber(session.workspace.id);
    const task = await this.local.create(session, input, { id, number });
    await this.enqueue(session, 'task.create', id, { ...input }, null);
    return task;
  }

  async update(session: Session, target: Target, changes: Parameters<TaskOperations['update']>[2]): Promise<TaskView> {
    const before = await this.find(session, target);
    const payload = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const base = Object.fromEntries(CHANGE_FIELDS.filter((field) => field in payload).map((field) => [field, before[field]]));
    return this.write(session, before, 'task.change', payload, base, () => this.local.update(session, before, changes));
  }

  start(session: Session, target: Target, extra: Parameters<TaskOperations['start']>[2] = {}): Promise<TaskView> {
    return this.update(session, target, { assigneeId: session.user.id, status: 'in_progress', ...extra });
  }

  complete(session: Session, target: Target): Promise<TaskView> {
    return this.update(session, target, { status: 'done' });
  }

  async reopen(session: Session, target: Target): Promise<TaskView> {
    const task = await this.find(session, target);
    if (!isClosed(task.status)) throw new ValidationError(`${formatTaskRef(task.number)} is already open.`);
    return this.update(session, task, { status: 'todo' });
  }

  async comment(session: Session, target: Target, body: string): Promise<void> {
    const task = await this.find(session, target);
    const commentId = randomUUID();
    await this.write(session, task, 'task.comment', { commentId, body }, null, async () => {
      await this.local.comment(session, task, body, { id: commentId });
    });
  }

  async recordGitEvent(
    session: Session,
    target: Target,
    event: Parameters<TaskOperations['recordGitEvent']>[2],
    fields: Parameters<TaskOperations['recordGitEvent']>[3] = {},
  ): Promise<TaskView> {
    const task = await this.find(session, target);
    return this.write(session, task, 'task.git_event', { event, fields }, null, () => this.local.recordGitEvent(session, task, event, fields));
  }

  /** Applies locally, remembers which activity rows were optimistic, then queues the operation. */
  private async write<T>(
    session: Session,
    task: Task,
    type: OpType,
    payload: Record<string, unknown>,
    base: Record<string, unknown> | null,
    apply: () => Promise<T>,
  ): Promise<T> {
    const before = await this.context.store.activityIds(task.id);
    const result = await apply();
    const after = await this.context.store.activityIds(task.id);
    const optimistic = [...after].filter((id) => !before.has(id));
    // Nothing changed locally (e.g. same value again): nothing to tell the server.
    if (type === 'task.change' && optimistic.length === 0) return result;
    await this.context.store.enqueue(
      { opId: randomUUID(), workspaceId: session.workspace.id, type, taskId: task.id, payload, base, occurredAt: new Date() },
      optimistic,
    );
    this.context.onWrite();
    return result;
  }

  private async enqueue(session: Session, type: OpType, taskId: string, payload: Record<string, unknown>, base: Record<string, unknown> | null): Promise<void> {
    const optimistic = await this.context.store.activityIds(taskId);
    await this.context.store.enqueue({ opId: randomUUID(), workspaceId: session.workspace.id, type, taskId, payload, base, occurredAt: new Date() }, optimistic);
    this.context.onWrite();
  }

  private async find(session: Session, target: Target): Promise<Task> {
    return this.local.get(session, target);
  }
}
