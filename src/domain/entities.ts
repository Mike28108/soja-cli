export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
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

export type ProjectRef = Pick<Project, 'id' | 'name' | 'key'>;

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
