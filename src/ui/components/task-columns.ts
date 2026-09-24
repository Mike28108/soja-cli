/** Column widths for the task table at a given terminal width. 0 = hidden. */
export interface TaskColumns {
  ref: number;
  priority: number;
  project: number;
  status: number;
  statusGlyphOnly: boolean;
  assignee: number;
  title: number;
}

const POINTER = 2;

/**
 * Drops detail as the terminal narrows: assignee first, then the status
 * label (the colored glyph stays), then the project. ID, priority and
 * title always remain.
 */
export function layoutTaskColumns(width: number, options: { showAssignee: boolean; refWidth: number }): TaskColumns {
  const ref = options.refWidth + 2;
  const priority = 8;
  const wide = width >= 100;
  const medium = width >= 80;
  const narrow = width >= 64;

  const columns: TaskColumns = {
    ref,
    priority,
    project: medium ? 15 : narrow ? 13 : 0,
    status: medium ? 15 : 3,
    statusGlyphOnly: !medium,
    assignee: wide && options.showAssignee ? 11 : 0,
    title: 0,
  };
  const used = POINTER + columns.ref + columns.priority + columns.project + columns.status + columns.assignee;
  columns.title = Math.max(10, width - used);
  return columns;
}
