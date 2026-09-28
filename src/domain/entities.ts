export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Supplied by the online account profile; absent from local accounts. */
  isCeo?: boolean;
}

export type UserRef = Pick<User, 'id' | 'username' | 'displayName'>;

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const WORKSPACE_ROLES = ['owner', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  designated?: boolean;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
  repositoryUrl: string | null;
  repositoryPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shared repository identity; `localPath` is stored only on this machine. */
export interface ProjectRepository {
  id: string;
  projectId: string;
  name: string;
  repositoryUrl: string | null;
  localPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectRef = Pick<Project, 'id' | 'name' | 'key'>;

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
