import type { ActivityEvent } from '../domain/activity.js';
import type { Project, ProjectRef, ProjectRepository, User, UserRef, Workspace, WorkspaceRole } from '../domain/entities.js';
import type { StatusCounts, Task } from '../domain/task.js';

/** Who is acting and where. Every workspace-scoped service call takes one. */
export interface Session {
  user: User;
  workspace: Workspace;
}

/** A developer in a workspace, as every data source can provide it. */
export interface Member extends UserRef {
  role: WorkspaceRole;
  designated?: boolean;
}

export interface TaskView extends Task {
  /** Human identifier, e.g. `SOJA-12`. */
  ref: string;
  project: ProjectRef | null;
  assignee: UserRef | null;
}

export type TimelineEntry =
  | { kind: 'event'; id: string; at: Date; actor: UserRef | null; text: string; event: ActivityEvent }
  | { kind: 'comment'; id: string; at: Date; actor: UserRef | null; body: string };

export interface TaskDetails extends TaskView {
  creator: UserRef | null;
  timeline: TimelineEntry[];
  suggestedBranch: string;
}

export interface ProjectSummary extends Project {
  counts: StatusCounts;
  active: number;
  repositories: ProjectRepository[];
}
