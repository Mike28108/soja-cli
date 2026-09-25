import type { ConfigStore } from '../../config/config.js';
import type { Repositories } from '../../data/repositories.js';
import { GitConsole } from '../../git/console.js';
import type { SyncControl } from '../../data/sync/index.js';
import type { GitClient } from '../../git/types.js';
import { FolderService } from './folder-service.js';
import { GitWorkflowService } from './git-workflow-service.js';
import { ProjectService } from './project-service.js';
import { SessionService } from './session-service.js';
import { TaskService } from './task-service.js';
import { WorkspaceService } from './workspace-service.js';
import type {
  ChatOperations,
  FolderOperations,
  GitOperations,
  ProjectOperations,
  SessionOperations,
  TaskOperations,
  WorkspaceOperations,
} from '../ports.js';

/** Everything the CLI and the TUI are allowed to call. Both get the same instance shape. */
export interface AppServices {
  session: SessionOperations;
  workspaces: WorkspaceOperations;
  projects: ProjectOperations;
  tasks: TaskOperations;
  git: GitOperations;
  folders: FolderOperations;
  /** Live log of the Git commands SOJA runs, for the interface to display. */
  gitConsole: GitConsole;
  /** Where the data lives: this machine (SQLite) or a SOJA server. */
  environment: { mode: 'local' } | { mode: 'remote'; server: string };
  /** Offline sync controls; present only in remote mode. */
  sync?: SyncControl;
  /** Team chat; present only in remote mode (there is no team locally). */
  chat?: ChatOperations;
}

export interface ServiceOptions {
  git: GitClient;
  gitConsole?: GitConsole;
  clock?: () => Date;
}

export function createServices(repos: Repositories, config: ConfigStore, options: ServiceOptions): AppServices {
  const workspaces = new WorkspaceService(repos, config);
  const projects = new ProjectService(repos, options.git);
  const tasks = new TaskService(repos, options.clock);
  return {
    session: new SessionService(repos, config, workspaces),
    workspaces,
    projects,
    tasks,
    git: new GitWorkflowService(tasks, projects, options.git),
    folders: new FolderService(config),
    gitConsole: options.gitConsole ?? new GitConsole(),
    environment: { mode: 'local' },
  };
}

export type {
  MergeDetection,
  MergePlan,
  PullRequestUpdate,
  StartPlan,
  StartResult,
  TaskGitState,
  TaskPullRequestState,
  WorkingState,
} from './git-workflow-service.js';
export { pullRequestWarnings } from './git-workflow-service.js';
export type { FolderEntry, ParentFolder } from './folder-service.js';
export type { CreateProjectInput, ProjectChanges } from './project-service.js';
export type { SetupInput } from './session-service.js';
export type { CreateTaskInput, TaskChanges, TaskTarget } from './task-service.js';
