import { styleText } from 'node:util';
import type { TaskView } from '../application/types.js';
import { priorityStyles, statusStyles, symbols, type ColorName, type TokenStyle } from '../ui/theme/theme.js';
import type { DisplayError } from '../utils/errors.js';

type Format = Parameters<typeof styleText>[0];
type FormatName = Exclude<Extract<Format, string>, `#${string}`>;

/** Styles text for stdout. Plain automatically when piped or when NO_COLOR is set. */
export function paint(format: Format, text: string, stream: NodeJS.WriteStream = process.stdout): string {
  return styleText(format, text, { stream });
}

export const bold = (text: string) => paint('bold', text);
export const dim = (text: string) => paint('dim', text);
export const color = (name: ColorName, text: string) => paint(name, text);

export function token(style: TokenStyle, text: string = style.label): string {
  const formats: FormatName[] = [];
  if (style.color) formats.push(style.color);
  if (style.bold) formats.push('bold');
  if (style.dim) formats.push('dim');
  return formats.length ? paint(formats, text) : text;
}

export function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

export function success(message: string): void {
  print(`${color('green', symbols.check)} ${message}`);
}

export function printError(error: DisplayError): void {
  const stream = process.stderr;
  stream.write(`${paint('red', `${symbols.cross} ${error.message}`, stream)}\n`);
  if (error.hint) stream.write(`${paint('dim', `  ${error.hint}`, stream)}\n`);
  if (error.debug) stream.write(`\n${paint('dim', error.debug, stream)}\n`);
}

const pad = (text: string, width: number) => (text.length >= width ? `${text.slice(0, width - 1)}${symbols.ellipsis}` : text.padEnd(width));

/** One aligned line per task. Narrow terminals drop project and status labels. */
export function taskLine(task: TaskView, options: { showAssignee?: boolean } = {}, columns = process.stdout.columns || 100): string {
  const priority = priorityStyles[task.priority];
  const status = statusStyles[task.status];
  const parts = [dim(pad(task.ref, 10)), token(priority, pad(priority.label, 8))];
  let used = 18;
  if (columns >= 80) {
    parts.push(pad(task.project?.name ?? '—', 15), token(status, pad(`${status.glyph} ${status.label}`, 15)));
    used += 30;
  } else {
    parts.push(token(status, `${status.glyph} `));
    used += 2;
  }
  if (columns >= 100 && options.showAssignee !== false) {
    parts.push(dim(pad(task.assignee ? `@${task.assignee.username}` : '—', 11)));
    used += 11;
  }
  const room = Math.max(12, columns - used - 2);
  const title = `${task.remunerated ? '$ ' : ''}${task.title}`;
  parts.push(title.length > room ? `${title.slice(0, room - 1)}${symbols.ellipsis}` : title);
  return `  ${parts.join('')}`;
}
