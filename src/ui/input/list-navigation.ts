import type { Key } from 'ink';

export interface ListState {
  index: number;
  offset: number;
}

/**
 * Vim-style movement over a list of `count` items shown `height` at a time.
 * Returns the new state, or `null` when the key is not a movement key.
 * `vim` is off inside text inputs, where j/k are letters.
 */
export function moveInList(
  state: ListState,
  input: string,
  key: Key,
  count: number,
  height: number,
  vim = true,
): ListState | null {
  // Letters only count as vim motions when typed bare: ctrl+k is not k.
  const letter = vim && !key.ctrl && !key.meta ? input : '';
  let index: number;
  if (key.downArrow || letter === 'j' || (key.ctrl && input === 'n')) index = state.index + 1;
  else if (key.upArrow || letter === 'k' || (key.ctrl && input === 'p')) index = state.index - 1;
  else if (key.pageDown || (key.ctrl && input === 'd')) index = state.index + Math.max(1, Math.floor(height / 2));
  else if (key.pageUp || (key.ctrl && input === 'u')) index = state.index - Math.max(1, Math.floor(height / 2));
  else if (letter === 'g' || key.home) index = 0;
  else if (letter === 'G' || key.end) index = count - 1;
  else return null;
  return clampList({ index, offset: state.offset }, count, height);
}

/** Keeps the selection inside the list and the viewport around the selection. */
export function clampList(state: ListState, count: number, height: number): ListState {
  if (count <= 0) return { index: 0, offset: 0 };
  const visible = Math.max(1, height);
  const index = Math.max(0, Math.min(count - 1, state.index));
  let offset = Math.max(0, Math.min(state.offset, Math.max(0, count - visible)));
  if (index < offset) offset = index;
  if (index >= offset + visible) offset = index - visible + 1;
  return { index, offset };
}
