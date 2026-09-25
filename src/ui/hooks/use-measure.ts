import type { DOMElement } from 'ink';
import { useEffect, useState, type RefObject } from 'react';

/**
 * Width and height of an element after layout. Ink's `useBoxMetrics` re-renders
 * on every commit even when nothing changed (it sets `hasMeasured` again),
 * which loops when a panel re-renders often; this only updates on a change.
 */
export function useMeasure(ref: RefObject<DOMElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // After every render on purpose: layout can change without this component's props changing.
  // It only sets state when the size really changed, so it cannot loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const layout = ref.current?.yogaNode?.getComputedLayout();
    if (!layout) return;
    const width = Math.floor(layout.width);
    const height = Math.floor(layout.height);
    if (width !== size.width || height !== size.height) setSize({ width, height });
  });
  return size;
}
