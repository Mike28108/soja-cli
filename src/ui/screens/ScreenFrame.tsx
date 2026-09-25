import type { ReactNode } from 'react';
import { useHints, type Hint } from '../chrome/context.js';
import { useLayout } from '../hooks/use-layout.js';
import { Panel } from '../kit/Panel.js';

/**
 * A screen: one panel filling the main area, titled in its border. Its
 * shortcuts go to the status bar while it is on top. Content keeps its
 * natural height and is clipped, never squeezed into overlapping rows.
 */
export function ScreenFrame({ hints, title, aside, children }: { hints: readonly Hint[]; title?: string | undefined; aside?: string | undefined; children: ReactNode }) {
  useHints(hints);
  const { height } = useLayout();
  return (
    <Panel title={title} aside={aside} focused height={height + 2} flexGrow={1}>
      {children}
    </Panel>
  );
}

export type { Hint };
