import type { ConfigStore } from '../../config/config.js';
import type { Repositories } from '../../data/repositories.js';
import { GitConsole } from '../../git/console.js';
import type { GitClient } from '../../git/types.js';
import { FolderService } from './folder-service.js';
import { GitWorkflowService } from './git-workflow-service.js';
import { ProjectService } from './project-service.js';
import { SessionService } from './session-service.js';
import { TaskService } from './task-service.js';
import { WorkspaceService } from './workspace-service.js';

/** Everything the CLI and the TUI are allowed to call. Both get the same instance shape. */
export interface AppServices {
  session: SessionService;
  workspaces: WorkspaceService;
  projects: ProjectService;
  tasks: TaskService;
  git: GitWorkflowService;
  folders: FolderService;
  /** Live log of the Git commands SOJA runs, for the interface to display. */
  gitConsole: GitConsole;
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
    git: new GitWorkflowService(repos, tasks, projects, options.git),
    folders: new FolderService(config),
    gitConsole: options.gitConsole ?? new GitConsole(),
  };
}

export type { MergeDetection, MergePlan, StartPlan, StartResult, TaskGitState, WorkingState } from './git-workflow-service.js';
export type { FolderEntry, ParentFolder } from './folder-service.js';
export type { CreateProjectInput } from './project-service.js';
export type { SetupInput } from './session-service.js';
export type { CreateTaskInput, TaskChanges, TaskTarget } from './task-service.js';
