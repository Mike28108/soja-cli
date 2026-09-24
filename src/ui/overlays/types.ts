import type { ColorName } from '../theme/theme.js';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
  color?: ColorName;
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
  onSubmit: (value: string) => SubmitResult;
}

export type Overlay =
  | { kind: 'search' }
  | { kind: 'new-task'; projectId: string | null }
  | PickerSpec
  | PromptSpec;
