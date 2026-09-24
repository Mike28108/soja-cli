import { useWindowSize } from 'ink';

/** Rows used by the header (1 + gap) and the footer (gap + 1). */
const CHROME_ROWS = 4;

export interface Layout {
  /** Usable width inside the horizontal padding. */
  width: number;
  /** Rows available to the active screen or overlay body. */
  height: number;
  rows: number;
}

export function useLayout(): Layout {
  const { columns, rows } = useWindowSize();
  return { width: Math.max(20, columns - 2), height: Math.max(4, rows - CHROME_ROWS), rows };
}
