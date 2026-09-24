import type { TaskPriority, TaskStatus } from '../../domain/task.js';
import { PRIORITY_LABELS, STATUS_LABELS } from '../../domain/task.js';

/**
 * Every color SOJA uses lives here. Interface colors are ANSI names, so they
 * follow the user's terminal palette (dark or light). Only the wordmark uses
 * truecolor hex. Chalk downsamples it on 256/16-color terminals.
 * The same names work for Ink's `color` prop and for `node:util` styleText
 * in the plain CLI.
 */
export type ColorName =
  | 'green'
  | 'greenBright'
  | 'red'
  | 'redBright'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'gray'
  | 'white';

export const palette = {
  accent: 'green',
  muted: 'gray',
  danger: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'cyan',
} as const satisfies Record<string, ColorName>;

/** Soy green, from young leaf to ripe pod. */
export const brandGradient = ['#D7E86A', '#A9D46F', '#7DBE6E', '#58A56B'] as const;

export const symbols = {
  pointer: '▌',
  cursor: '▁',
  dot: '·',
  arrow: '→',
  check: '✓',
  cross: '✕',
  active: '●',
  rule: '─',
  comment: '›',
  ellipsis: '…',
  /** Chat: a message waiting to be sent, a quoted reply, unread messages. */
  pending: '⋯',
  reply: '↳',
  unread: '✉',
} as const;

export interface TokenStyle {
  label: string;
  color?: ColorName;
  bold?: boolean;
  dim?: boolean;
}

export const priorityStyles: Record<TaskPriority, TokenStyle> = {
  urgent: { label: PRIORITY_LABELS.urgent, color: 'redBright', bold: true },
  high: { label: PRIORITY_LABELS.high, color: 'red' },
  medium: { label: PRIORITY_LABELS.medium, color: 'yellow' },
  low: { label: PRIORITY_LABELS.low, dim: true },
  none: { label: '—', dim: true },
};

export interface StatusStyle extends TokenStyle {
  glyph: string;
}

export const statusStyles: Record<TaskStatus, StatusStyle> = {
  backlog: { label: STATUS_LABELS.backlog, glyph: '◌', dim: true },
  todo: { label: STATUS_LABELS.todo, glyph: '○' },
  in_progress: { label: STATUS_LABELS.in_progress, glyph: '◐', color: 'yellow' },
  review: { label: STATUS_LABELS.review, glyph: '◎', color: 'cyan' },
  blocked: { label: STATUS_LABELS.blocked, glyph: '⊘', color: 'red' },
  done: { label: STATUS_LABELS.done, glyph: '✓', color: 'green' },
  cancelled: { label: STATUS_LABELS.cancelled, glyph: '✕', dim: true },
};
