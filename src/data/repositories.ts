import type { ActivityEvent, TaskActivity } from '../domain/activity.js';
import type { Project, TaskComment, User, Workspace, WorkspaceMember, WorkspaceRole } from '../domain/entities.js';
import type { Task, TaskStatus } from '../domain/task.js';

/**
 * Persistence contracts used by the application services. The UI never sees
 * these; it talks to services. Today the only implementation is local
 * SQLite (`data/local`); a future `data/remote` will speak to soja-backend.
 */

export interface NewUser {
  username: string;
  displayName: string;
  email?: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByIds(ids: readonly string[]): Promise<User[]>;
  create(input: NewUser): Promise<User>;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export interface MemberWithUser extends User {
  role: WorkspaceRole;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  create(input: { name: string; slug: string; description?: string | null }): Promise<Workspace>;
  listForUser(userId: string): Promise<WorkspaceWithRole[]>;
  addMember(member: WorkspaceMember): Promise<void>;
  findMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<MemberWithUser[]>;
}

export interface NewProject {
  workspaceId: string;
  name: string;
  key: string;
  description?: string | null;
  repositoryUrl?: string | null;
  repositoryPath?: string | null;
}

export type ProjectPatch = Partial<Pick<Project, 'name' | 'description' | 'repositoryUrl' | 'repositoryPath'>>;

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByKey(workspaceId: string, key: string): Promise<Project | null>;
  listByWorkspace(workspaceId: string): Promise<Project[]>;
  create(input: NewProject): Promise<Project>;
  update(id: string, patch: ProjectPatch): Promise<Project>;
}

export type NewTask = Omit<Task, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt'> &
  Partial<Pick<Task, 'startedAt' | 'completedAt'>> & {
    /** Chosen by the caller (offline replica); random otherwise. */
    id?: string;
    /** Explicit number (provisional, negative, in the offline replica); next free otherwise. */
    number?: number;
  };

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'type'
    | 'priority'
    | 'status'
    | 'projectId'
    | 'assigneeId'
    | 'requester'
    | 'branch'
    | 'baseBranch'
    | 'branchStart'
    | 'startedAt'
    | 'completedAt'
  >
>;

export interface TaskQuery {
  workspaceId: string;
  assigneeId?: string;
  projectId?: string;
  statuses?: readonly TaskStatus[];
  /** Matches the title (case-insensitive substring) or the exact task number. */
  search?: { text: string; number: number | null };
  limit?: number;
}

export interface StatusCountRow {
  projectId: string | null;
  status: TaskStatus;
  count: number;
}

export interface TaskRepository {
  /** Assigns the next per-workspace number atomically. */
  create(input: NewTask): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  findByNumber(workspaceId: string, number: number): Promise<Task | null>;
  list(query: TaskQuery): Promise<Task[]>;
  update(id: string, patch: TaskPatch): Promise<Task>;
  countByProjectAndStatus(workspaceId: string): Promise<StatusCountRow[]>;
}

export interface CommentRepository {
  create(input: { id?: string; taskId: string; userId: string; body: string }): Promise<TaskComment>;
  listByTask(taskId: string): Promise<TaskComment[]>;
}

export interface ActivityRepository {
  record(taskId: string, userId: string | null, event: ActivityEvent): Promise<TaskActivity>;
  listByTask(taskId: string): Promise<TaskActivity[]>;
}

export interface Repositories {
  users: UserRepository;
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  comments: CommentRepository;
  activity: ActivityRepository;
  /** Runs `work` atomically: a task change and its activity entry land together or not at all. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
