import type { TaskView } from '../../application/types.js';
import type { GitErrorCode } from '../../git/types.js';
import type { Tone } from '../theme/theme.js';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
  /** Emphasis for actions that deserve a second look (delete, force). */
  tone?: Tone;
  dim?: boolean;
}

/**
 * Handlers return `false` when the action failed (the error is already
 * shown in the footer); the overlay then stays open so the user can retry.
 */
export type SubmitResult = boolean | void | Promise<boolean | void>;

export interface PickerSpec {
  kind: 'picker';
  title: string;
  context?: string;
  options: PickerOption[];
  initial?: string | null;
  /** Adds a type-to-filter field; j/k then become letters and ↑/↓ move. */
  filterable?: boolean;
  onSelect: (value: string) => SubmitResult;
  /** Offered when the filter matches nothing, e.g. "Add developer @x". */
  create?: { label: (query: string) => string; onCreate: (query: string) => SubmitResult };
}

export interface PromptSpec {
  kind: 'prompt';
  title: string;
  context?: string;
  initial?: string;
  placeholder?: string;
  /** Tab completes from these. */
  suggestions?: string[];
  allowEmpty?: boolean;
  /** A secret: typed characters show as dots and nothing is suggested. */
  secret?: boolean;
  onSubmit: (value: string) => SubmitResult;
}

export interface GitAction {
  key: string;
  label: string;
  action: () => unknown;
}

/**
 * Runs a Git operation while showing its commands and output live. On
 * failure it shows the diagnosis, suggestions and recovery keys.
 */
export interface GitRunSpec {
  kind: 'git-run';
  title: string;
  context?: string;
  /** Performs the operation and returns the success line. `interactive` means the terminal was released. */
  run: (interactive: boolean) => Promise<string>;
  /** Offered after success, e.g. "d delete branch". */
  next?: GitAction[];
  /** Offered after failure, keyed by GitError code, e.g. not_merged → "f delete anyway". */
  recover?: Partial<Record<GitErrorCode, GitAction>>;
}

/** A yes/no question with buttons. Cancel is the default, so Enter never destroys anything by accident. */
export interface ConfirmSpec {
  kind: 'confirm';
  title: string;
  context?: string;
  /** What happens, in one or two sentences. */
  message?: string;
  confirmLabel: string;
  tone?: Tone;
  onConfirm: () => SubmitResult;
}

export type Overlay =
  | { kind: 'search' }
  | ConfirmSpec
  | GitRunSpec
  | { kind: 'commit'; task: TaskView }
  | { kind: 'git-log' }
  | { kind: 'new-task'; projectId: string | null }
  | PickerSpec
  | PromptSpec;
