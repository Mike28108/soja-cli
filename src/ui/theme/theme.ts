import type { TaskPriority, TaskStatus } from '../../domain/task.js';
import { PRIORITY_LABELS, STATUS_LABELS } from '../../domain/task.js';

/**
 * Every color SOJA uses lives here.
 *
 * - The interface (TUI) uses SOJA's own palette in truecolor, with a dark and
 *   a light variant chosen when it opens (`setThemeMode`). Chalk downsamples
 *   it on 256/16-color terminals.
 * - The plain CLI keeps ANSI names (`ColorName`, `statusStyles`,
 *   `priorityStyles`), so piped output and `NO_COLOR` behave as before.
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

export type ThemeMode = 'dark' | 'light';

/** Semantic colors of the interface. Components never use raw hex values. */
export interface Palette {
  /** Brand green for focus, the active tab, the selection bar. */
  accent: string;
  /** Text on accent backgrounds. */
  onAccent: string;
  text: string;
  /** Secondary text: metadata, hints. */
  muted: string;
  /** Tertiary text: placeholders, separators. */
  faint: string;
  border: string;
  /** Border of the focused panel. */
  borderFocus: string;
  /** Title and status bars. */
  bar: string;
  barText: string;
  /** Floating windows and raised areas. */
  surface: string;
  /** Background of the selected row. */
  selection: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  /** Merged pull requests (GitHub's own convention). */
  merged: string;
  /** Soft backgrounds for badges of each tone. */
  dangerSoft: string;
  warningSoft: string;
  successSoft: string;
  infoSoft: string;
  mergedSoft: string;
  neutralSoft: string;
}

const DARK: Palette = {
  accent: '#8CC66F',
  onAccent: '#14180F',
  text: '#E6E3DA',
  muted: '#9C998E',
  faint: '#66645C',
  border: '#3B3D35',
  borderFocus: '#8CC66F',
  bar: '#23261F',
  barText: '#C9C6BB',
  surface: '#2A2D25',
  selection: '#33402C',
  danger: '#EF6B5F',
  warning: '#E6B450',
  success: '#8CC66F',
  info: '#62B6D9',
  merged: '#B894E6',
  dangerSoft: '#4A2622',
  warningSoft: '#453A1E',
  successSoft: '#2F4125',
  infoSoft: '#1F3A47',
  mergedSoft: '#3A2D4A',
  neutralSoft: '#34362F',
};

const LIGHT: Palette = {
  accent: '#3F8A3F',
  onAccent: '#FFFFFF',
  text: '#26251F',
  muted: '#6B685E',
  faint: '#A29F94',
  border: '#D5D2C6',
  borderFocus: '#3F8A3F',
  bar: '#ECEAE2',
  barText: '#3E3C35',
  surface: '#F6F5EF',
  selection: '#DDEBD3',
  danger: '#C43D32',
  warning: '#A06A00',
  success: '#3F8A3F',
  info: '#1F76A0',
  merged: '#7A4FB8',
  dangerSoft: '#F6DCD8',
  warningSoft: '#F3E6C4',
  successSoft: '#DDEBD3',
  infoSoft: '#D6E9F2',
  mergedSoft: '#E8DDF6',
  neutralSoft: '#E6E4DC',
};

/** The active interface palette. Filled in place by `setThemeMode` before the interface renders. */
export const palette: Palette = { ...DARK };
let mode: ThemeMode = 'dark';

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  Object.assign(palette, next === 'light' ? LIGHT : DARK);
}

export function themeMode(): ThemeMode {
  return mode;
}

export type Tone = 'danger' | 'warning' | 'success' | 'info' | 'merged' | 'neutral';

/** Foreground and soft background of a tone, for badges. */
export function toneColors(tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'danger':
      return { fg: palette.danger, bg: palette.dangerSoft };
    case 'warning':
      return { fg: palette.warning, bg: palette.warningSoft };
    case 'success':
      return { fg: palette.success, bg: palette.successSoft };
    case 'info':
      return { fg: palette.info, bg: palette.infoSoft };
    case 'merged':
      return { fg: palette.merged, bg: palette.mergedSoft };
    case 'neutral':
      return { fg: palette.muted, bg: palette.neutralSoft };
  }
}

export const statusTone: Record<TaskStatus, Tone> = {
  backlog: 'neutral',
  todo: 'neutral',
  in_progress: 'warning',
  review: 'info',
  blocked: 'danger',
  done: 'success',
  cancelled: 'neutral',
};

export const priorityTone: Record<TaskPriority, Tone> = {
  urgent: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
  none: 'neutral',
};

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
  /** Checks still running. */
  running: '◌',
  pullRequest: '#',
  chevron: '›',
  link: '⇄',
  info: 'ℹ',
  /** Filled bar for gauges and scroll thumbs; light shade for their track. */
  full: '█',
  shade: '░',
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
