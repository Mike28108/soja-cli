import type {
  ProjectOperations,
  SessionOperations,
  TaskOperations,
  WorkspaceOperations,
} from '../../application/ports.js';
import { resolveRepositoryRoot } from '../../application/repository-root.js';
import type { TaskFilter } from '../../application/filters.js';
import { buildTimeline } from '../../application/timeline.js';
import type { Member, ProjectSummary, Session, TaskDetails, TaskView } from '../../application/types.js';
import type { ConfigStore, RemoteSettings } from '../../config/config.js';
import type { TaskActivity } from '../../domain/activity.js';
import type { Project, ProjectRef, TaskComment, User, UserRef, Workspace } from '../../domain/entities.js';
import { NotFoundError, SojaError, ValidationError } from '../../domain/errors.js';
import { formatTaskRef, parseTaskRef, suggestBranchName } from '../../domain/task.js';
import type { GitClient } from '../../git/types.js';
import type { WorkspaceWithRole } from '../repositories.js';
import type { ApiClient } from './api-client.js';

/** Projects as the server knows them: no local path. */
type ServerProject = Omit<Project, 'repositoryPath'>;
type ServerProjectSummary = Omit<ProjectSummary, 'repositoryPath'>;

interface ServerTaskDetails {
  task: TaskView;
  creator: UserRef | null;
  activity: TaskActivity[];
  comments: TaskComment[];
  users: UserRef[];
  projects: ProjectRef[];
}

/** Shared plumbing: the API client plus the machine-local remote settings in config.json. */
export class RemoteContext {
  constructor(
    readonly api: ApiClient,
    private readonly config: ConfigStore,
  ) {}

  settings(): RemoteSettings {
    const remote = this.config.load()?.remote;
    if (!remote) throw new SojaError('No SOJA server configured.', { hint: 'Run `soja login --server <url>`.' });
    return remote;
  }

  saveSettings(patch: Partial<RemoteSettings>): void {
    const current = this.config.load();
    if (!current?.remote) throw new SojaError('No SOJA server configured.', { hint: 'Run `soja login --server <url>`.' });
    this.config.save({ ...current, remote: { ...current.remote, ...patch } });
  }

  /** Server project + the path where this developer keeps it. */
  withPath<T extends ServerProject>(project: T): T & { repositoryPath: string | null } {
    return { ...project, repositoryPath: this.settings().repositoryPaths[project.id] ?? null };
  }

  ws(session: Session): string {
    return `/v1/workspaces/${session.workspace.id}`;
  }
}

export class RemoteSessionService implements SessionOperations {
  constructor(private readonly context: RemoteContext) {}

  async current(): Promise<Session | null> {
    const { user, workspaces } = await this.context.api.get<{ user: User; workspaces: WorkspaceWithRole[] }>('/v1/me');
    const wanted = this.context.settings().workspaceId;
    const workspace = workspaces.find((candidate) => candidate.id === wanted) ?? workspaces[0];
    if (!workspace) {
      throw new SojaError(`You have no workspaces on ${this.context.api.baseUrl} yet.`, {
        hint: 'Create one with `soja workspace create "<name>"`, or ask an owner to add you.',
      });
    }
    if (workspace.id !== wanted) this.context.saveSettings({ workspaceId: workspace.id });
    return { user, workspace };
  }

  async user(): Promise<User | null> {
    return (await this.context.api.get<{ user: User }>('/v1/me')).user;
  }

  async setup(): Promise<Session> {
    throw new SojaError('Remote mode has no local setup.', { hint: 'Sign in with `soja login --server <url>`.' });
  }
}

export class RemoteWorkspaceService implements WorkspaceOperations {
  constructor(private readonly context: RemoteContext) {}

  async list(): Promise<WorkspaceWithRole[]> {
    return (await this.context.api.get<{ workspaces: WorkspaceWithRole[] }>('/v1/me')).workspaces;
  }

  create(_owner: User, input: Parameters<WorkspaceOperations['create']>[1]): Promise<Workspace> {
    return this.context.api.post<Workspace>('/v1/workspaces', input);
  }

  async switchTo(user: User, idOrSlug: string): Promise<Session> {
    const { workspace } = await this.context.api.get<{ workspace: Workspace }>(`/v1/workspaces/${encodeURIComponent(idOrSlug)}`);
    this.context.saveSettings({ workspaceId: workspace.id });
    return { user, workspace };
  }

  members(session: Session): Promise<Member[]> {
    return this.context.api.get<Member[]>(`${this.context.ws(session)}/members`);
  }

  async findMember(session: Session, username: string): Promise<Member> {
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    const member = (await this.members(session)).find((candidate) => candidate.username === normalized);
    if (!member) throw new NotFoundError(`@${normalized} is not a member of ${session.workspace.name}.`);
    return member;
  }

  /** On a server, developers are GitHub accounts that already signed in; display names come from GitHub. */
  addMember(session: Session, input: Parameters<WorkspaceOperations['addMember']>[1]): Promise<Member> {
    return this.context.api.post<Member>(`${this.context.ws(session)}/members`, { username: input.username });
  }
}

export class RemoteProjectService implements ProjectOperations {
  constructor(
    private readonly context: RemoteContext,
    private readonly git: GitClient,
  ) {}

  async list(session: Session): Promise<ProjectSummary[]> {
    const projects = await this.context.api.get<ServerProjectSummary[]>(`${this.context.ws(session)}/projects`);
    return projects.map((project) => this.context.withPath(project));
  }

  async create(session: Session, input: Parameters<ProjectOperations['create']>[1]): Promise<Project> {
    const { repositoryPath, ...shared } = input;
    const project = this.context.withPath(await this.context.api.post<ServerProject>(`${this.context.ws(session)}/projects`, shared));
    return repositoryPath ? this.linkRepository(session, project, repositoryPath) : project;
  }

  async get(session: Session, id: string): Promise<Project> {
    const project = (await this.list(session)).find((candidate) => candidate.id === id);
    if (!project) throw new NotFoundError('That project does not exist in this workspace.');
    return project;
  }

  /** The path stays on this machine; the origin URL is shared with the team if the project had none. */
  async linkRepository(session: Session, project: Project, path: string): Promise<Project> {
    const root = await resolveRepositoryRoot(this.git, path);
    const repositoryPaths = { ...this.context.settings().repositoryPaths, [project.id]: root };
    this.context.saveSettings({ repositoryPaths });
    if (!project.repositoryUrl) {
      const repositoryUrl = await this.git.originUrl(root);
      if (repositoryUrl) {
        const updated = await this.context.api.patch<ServerProject>(`${this.context.ws(session)}/projects/${project.id}`, { repositoryUrl });
        return this.context.withPath(updated);
      }
    }
    return { ...project, repositoryPath: root };
  }

  async unlinkRepository(_session: Session, project: Project): Promise<Project> {
    const repositoryPaths = Object.fromEntries(
      Object.entries(this.context.settings().repositoryPaths).filter(([projectId]) => projectId !== project.id),
    );
    this.context.saveSettings({ repositoryPaths });
    return { ...project, repositoryPath: null };
  }

  async findByRepository(session: Session, path: string): Promise<Project | null> {
    const root = await this.git.repositoryRoot(path).catch(() => null);
    if (!root) return null;
    const id = Object.entries(this.context.settings().repositoryPaths).find(([, linked]) => linked === root)?.[0];
    if (!id) return null;
    return (await this.list(session)).find((project) => project.id === id) ?? null;
  }

  async resolve(session: Session, keyOrName: string): Promise<Project> {
    const needle = keyOrName.trim().toLowerCase();
    const projects = await this.list(session);
    const project =
      projects.find((candidate) => candidate.key.toLowerCase() === needle) ??
      projects.find((candidate) => candidate.name.toLowerCase() === needle);
    if (!project) {
      throw new NotFoundError(`No project called “${keyOrName}” in ${session.workspace.name}.`, { hint: 'List them with `soja project list`.' });
    }
    return project;
  }
}

type Target = Parameters<TaskOperations['get']>[1];

/** Tasks live on the server; it assigns numbers, applies rules and writes the activity. */
export class RemoteTaskService implements TaskOperations {
  constructor(private readonly context: RemoteContext) {}

  list(session: Session, filter: TaskFilter, options: { projectId?: string } = {}): Promise<TaskView[]> {
    const query = new URLSearchParams({ filter, ...(options.projectId ? { projectId: options.projectId } : {}) });
    return this.context.api.get<TaskView[]>(`${this.context.ws(session)}/tasks?${query}`);
  }

  async search(session: Session, text: string, limit = 50): Promise<TaskView[]> {
    if (!text.trim()) return [];
    const query = new URLSearchParams({ q: text, limit: String(limit) });
    return this.context.api.get<TaskView[]>(`${this.context.ws(session)}/tasks?${query}`);
  }

  async get(session: Session, target: Target): Promise<TaskDetails> {
    const details = await this.context.api.get<ServerTaskDetails>(this.path(session, target));
    return {
      ...details.task,
      creator: details.creator,
      timeline: buildTimeline(details.activity, details.comments, {
        users: new Map(details.users.map((user) => [user.id, user])),
        projects: new Map(details.projects.map((project) => [project.id, project])),
      }),
      suggestedBranch: suggestBranchName(details.task),
    };
  }

  create(session: Session, input: Parameters<TaskOperations['create']>[1]): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.context.ws(session)}/tasks`, input);
  }

  update(session: Session, target: Target, changes: Parameters<TaskOperations['update']>[2]): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.path(session, target)}/changes`, changes);
  }

  start(session: Session, target: Target, extra: Parameters<TaskOperations['start']>[2] = {}): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.path(session, target)}/start`, extra);
  }

  complete(session: Session, target: Target): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.path(session, target)}/complete`);
  }

  async reopen(session: Session, target: Target): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.path(session, target)}/reopen`);
  }

  async comment(session: Session, target: Target, body: string): Promise<void> {
    await this.context.api.post(`${this.path(session, target)}/comments`, { body });
  }

  recordGitEvent(
    session: Session,
    target: Target,
    event: Parameters<TaskOperations['recordGitEvent']>[2],
    fields: Parameters<TaskOperations['recordGitEvent']>[3] = {},
  ): Promise<TaskView> {
    return this.context.api.post<TaskView>(`${this.path(session, target)}/git-events`, { event, fields });
  }

  knownRequesters(session: Session): Promise<string[]> {
    return this.context.api.get<string[]>(`${this.context.ws(session)}/requesters`);
  }

  private path(session: Session, target: Target): string {
    const number = typeof target === 'object' ? target.number : typeof target === 'number' ? target : parseTaskRef(target);
    if (number === null) throw new ValidationError(`“${String(target)}” is not a task ID.`, { hint: 'Use something like SOJA-12.' });
    return `${this.context.ws(session)}/tasks/${formatTaskRef(number)}`;
  }
}

