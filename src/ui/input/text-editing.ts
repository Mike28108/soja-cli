import type { Key } from 'ink';

export interface TextState {
  value: string;
  cursor: number;
}

/**
 * Pure line-editing rules for text fields (readline-style). Returns the new
 * state, or `null` when the key is not an editing key, so the owner can use
 * it (Enter, Esc, Tab, arrows up/down).
 */
export function editText(state: TextState, input: string, key: Key): TextState | null {
  const { value, cursor } = state;
  const at = (nextValue: string, nextCursor: number): TextState => ({
    value: nextValue,
    cursor: Math.max(0, Math.min(nextValue.length, nextCursor)),
  });

  if (key.return || key.escape || key.tab || key.upArrow || key.downArrow || key.pageUp || key.pageDown) return null;
  if (key.leftArrow) return at(value, key.ctrl || key.meta ? wordStart(value, cursor) : cursor - 1);
  if (key.rightArrow) return at(value, key.ctrl || key.meta ? wordEnd(value, cursor) : cursor + 1);
  if (key.home || (key.ctrl && input === 'a')) return at(value, 0);
  if (key.end || (key.ctrl && input === 'e')) return at(value, value.length);
  if (key.backspace) {
    if (key.meta) {
      const start = wordStart(value, cursor);
      return at(value.slice(0, start) + value.slice(cursor), start);
    }
    return cursor === 0 ? state : at(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
  }
  if (key.delete) return at(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
  if (key.ctrl && input === 'u') return at(value.slice(cursor), 0);
  if (key.ctrl && input === 'k') return at(value.slice(0, cursor), cursor);
  if (key.ctrl && input === 'w') {
    const start = wordStart(value, cursor);
    return at(value.slice(0, start) + value.slice(cursor), start);
  }
  if (key.ctrl || key.meta) return null;

  // Printable text, including pastes. Newlines and control characters are dropped.
  const text = input.replace(/[\r\n]+/g, ' ').replace(/\p{Cc}/gu, '');
  if (!text) return null;
  return at(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
}

function wordStart(value: string, cursor: number): number {
  let index = cursor;
  while (index > 0 && value[index - 1] === ' ') index -= 1;
  while (index > 0 && value[index - 1] !== ' ') index -= 1;
  return index;
}

function wordEnd(value: string, cursor: number): number {
  let index = cursor;
  while (index < value.length && value[index] === ' ') index += 1;
  while (index < value.length && value[index] !== ' ') index += 1;
  return index;
}
