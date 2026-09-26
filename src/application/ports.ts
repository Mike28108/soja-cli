import type { BackupService } from './services/backup-service.js';
import type { FolderService } from './services/folder-service.js';
import type { PreferenceService } from './services/preference-service.js';
import type { GitWorkflowService } from './services/git-workflow-service.js';
import type { ProjectService } from './services/project-service.js';
import type { SessionService } from './services/session-service.js';
import type { TaskService } from './services/task-service.js';
import type { WorkspaceService } from './services/workspace-service.js';
import type { FinanceOperations } from './finance.js';

/** The public methods of a class, as a contract other implementations can satisfy. */
type PublicApi<T> = { [K in keyof T]: T[K] };

/**
 * What the interface and the commands may call. Local mode implements these
 * over SQLite (`services/`); remote mode over the SOJA API (`data/remote/`).
 * Git, folders and the Git console are always local.
 */
export type SessionOperations = PublicApi<SessionService>;
export type WorkspaceOperations = PublicApi<WorkspaceService>;
export type { FinanceOperations };
export type { IntakeOperations } from './intake.js';
export type ProjectOperations = PublicApi<ProjectService>;
export type TaskOperations = PublicApi<TaskService>;
export type GitOperations = PublicApi<GitWorkflowService>;
export type FolderOperations = PublicApi<FolderService>;
export type PreferenceOperations = PublicApi<PreferenceService>;
export type BackupOperations = PublicApi<BackupService>;
export type { ChatOperations } from './chat.js';
export type { ImportOperations } from './import.js';
