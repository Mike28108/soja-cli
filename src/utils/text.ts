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
