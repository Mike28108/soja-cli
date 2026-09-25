/** Column widths for the task table at a given width. 0 = hidden. */
export interface TaskColumns {
  ref: number;
  priority: number;
  /** Meter and word (`▰▰▰▱ HIGH`) or only the meter. */
  priorityLabel: boolean;
  project: number;
  status: number;
  statusGlyphOnly: boolean;
  assignee: number;
  title: number;
}

const POINTER = 2;
/** The scroll bar column on the right. */
const SCROLL = 1;

/**
 * Drops detail as the space narrows: assignee first, then the priority word,
 * then the status label (the colored glyph stays), then the project. ID,
 * priority meter and title always remain.
 */
export function layoutTaskColumns(width: number, options: { showAssignee: boolean; refWidth: number }): TaskColumns {
  const ref = options.refWidth + 2;
  const wide = width >= 100;
  const medium = width >= 80;
  const narrow = width >= 64;

  const columns: TaskColumns = {
    ref,
    priority: medium ? 13 : 6,
    priorityLabel: medium,
    project: medium ? 15 : narrow ? 13 : 0,
    status: medium ? 17 : 5,
    statusGlyphOnly: !medium,
    assignee: wide && options.showAssignee ? 11 : 0,
    title: 0,
  };
  const used = POINTER + SCROLL + columns.ref + columns.priority + columns.project + columns.status + columns.assignee;
  columns.title = Math.max(10, width - used);
  return columns;
}
