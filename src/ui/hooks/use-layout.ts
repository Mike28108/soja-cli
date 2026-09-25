import { useTerminalSize } from './use-terminal-size.js';
import { APP_SLOGAN, WORDMARK, WORDMARK_WIDTH } from '../branding/brand.js';

/** Full wordmark and slogan at the left of the footer; narrow terminals stack them. */
export function footerRowsFor(columns: number): number {
  const inline = columns >= WORDMARK_WIDTH + APP_SLOGAN.length + 4;
  const sloganWidth = inline ? columns - WORDMARK_WIDTH - 4 : columns - 2;
  const brandRows = inline
    ? Math.max(WORDMARK.length, Math.ceil(APP_SLOGAN.length / Math.max(1, sloganWidth)))
    : WORDMARK.length + Math.ceil(APP_SLOGAN.length / Math.max(1, sloganWidth));
  return 1 + FOOTER_BRAND_GAP_ROWS + brandRows;
}
/** A quiet row between the screen panel and the footer. */
export const FOOTER_GAP_ROWS = 1;
/** A quiet row between footer shortcuts and the brand. */
export const FOOTER_BRAND_GAP_ROWS = 1;
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
  const barRows = 1 + FOOTER_GAP_ROWS + footerRowsFor(columns);
  return {
    width: Math.max(20, columns - sidebar - PANEL_COLUMNS),
    height: Math.max(4, rows - barRows - PANEL_ROWS),
    rows,
    columns,
    sidebar,
  };
}

export function useLayout(): Layout {
  const { columns, rows } = useTerminalSize();
  return layoutFor(columns, rows);
}
