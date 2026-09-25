import { useTerminalSize } from './use-terminal-size.js';

/** Top bar and status bar. */
const BAR_ROWS = 2;
/** The screen panel's borders (top and bottom; left and right plus padding). */
const PANEL_ROWS = 2;
const PANEL_COLUMNS = 4;
export const SIDEBAR_WIDTH = 26;
/** From this width on, the sidebar is shown. */
export const SIDEBAR_FROM = 110;

export interface Layout {
  /** Usable width inside the screen panel. */
  width: number;
  /** Rows available inside the screen panel. */
  height: number;
  rows: number;
  columns: number;
  /** Width of the sidebar (0 when hidden). */
  sidebar: number;
}

export function layoutFor(columns: number, rows: number): Layout {
  const sidebar = columns >= SIDEBAR_FROM ? SIDEBAR_WIDTH : 0;
  return {
    width: Math.max(20, columns - sidebar - PANEL_COLUMNS),
    height: Math.max(4, rows - BAR_ROWS - PANEL_ROWS),
    rows,
    columns,
    sidebar,
  };
}

export function useLayout(): Layout {
  const { columns, rows } = useTerminalSize();
  return layoutFor(columns, rows);
}
