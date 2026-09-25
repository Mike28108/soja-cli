import { useLayoutEffect, useRef, useState } from 'react';
import type { Key } from 'ink';
import { clampList, moveInList, type ListState } from '../input/list-navigation.js';

export interface ListControls {
  index: number;
  offset: number;
  /** Returns true when the key moved the selection. */
  handleKey(input: string, key: Key): boolean;
  select(index: number): void;
}

/** Selection + scrolling for a list of `count` items shown `height` rows at a time. */
export function useList(count: number, height: number, vim = true, initialIndex = 0, onSelect?: (index: number) => void): ListControls {
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [state, setState] = useState<ListState>(() => clampList({ index: initialIndex, offset: 0 }, count, height));
  const current = clampList(state, count, height);
  return {
    index: current.index,
    offset: current.offset,
    handleKey(input, key) {
      const next = moveInList(current, input, key, count, height, vim);
      if (!next) return false;
      setState(next);
      onSelectRef.current?.(next.index);
      return true;
    },
    select(index) {
      const next = clampList({ index, offset: current.offset }, count, height);
      setState(next);
      onSelectRef.current?.(next.index);
    },
  };
}
