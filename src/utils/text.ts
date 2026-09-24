import { homedir } from 'node:os';

/** Greedy word wrap by character count. Long words are hard-split. */
export function wrapText(text: string, width: number): string[] {
  const size = Math.max(1, width);
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      for (let chunk = word; chunk; chunk = chunk.slice(size)) {
        const piece = chunk.slice(0, size);
        if (!line) line = piece;
        else if (line.length + 1 + piece.length <= size) line += ` ${piece}`;
        else {
          lines.push(line);
          line = piece;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Keeps at most `max` lines, marking the cut with an ellipsis. */
export function clampLines(lines: readonly string[], max: number): string[] {
  if (lines.length <= max) return [...lines];
  const kept = lines.slice(0, Math.max(1, max));
  kept[kept.length - 1] = `${kept[kept.length - 1] ?? ''}…`;
  return kept;
}

export function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`;
}

/** Expands a leading `~` (typed in the interface, where no shell does it). */
export function expandHome(path: string, home: string = homedir()): string {
  return path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path;
}

/** Shortens paths under the home directory to `~/…`. */
export function tildify(path: string, home: string = homedir()): string {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * C0/C1 control characters except tab and newline (these carry ANSI escape
 * sequences: colors, cursor moves, window titles, clipboard writes), plus the
 * Unicode bidi controls used to disguise text ("Trojan Source").
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Makes text written by someone else safe to print in a terminal. Applied to
 * everything that comes from a SOJA server and to Git output from other
 * people's commits.
 */
export function terminalSafe(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(UNSAFE, '');
}
