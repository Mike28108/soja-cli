import type { Key } from 'ink';
import { describe, expect, it } from 'vitest';
import { KeyDispatcher, Layer } from '../../src/ui/input/dispatcher.js';
import { clampList, moveInList } from '../../src/ui/input/list-navigation.js';
import { editText } from '../../src/ui/input/text-editing.js';

const noKey: Key = {
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false, pageDown: false, pageUp: false,
  home: false, end: false, return: false, escape: false, ctrl: false, shift: false, tab: false,
  backspace: false, delete: false, meta: false, super: false, hyper: false, capsLock: false, numLock: false,
};
const key = (overrides: Partial<Key> = {}): Key => ({ ...noKey, ...overrides });

describe('editText', () => {
  const state = { value: 'fix webhook', cursor: 3 };

  it('inserts at the cursor, including pastes without newlines', () => {
    expect(editText(state, 'ed', key())).toEqual({ value: 'fixed webhook', cursor: 5 });
    expect(editText({ value: '', cursor: 0 }, 'a\nb', key())).toEqual({ value: 'a b', cursor: 3 });
  });

  it('deletes backwards and forwards', () => {
    expect(editText(state, '', key({ backspace: true }))).toEqual({ value: 'fi webhook', cursor: 2 });
    expect(editText(state, '', key({ delete: true }))).toEqual({ value: 'fixwebhook', cursor: 3 });
    expect(editText({ value: 'x', cursor: 0 }, '', key({ backspace: true }))).toEqual({ value: 'x', cursor: 0 });
  });

  it('supports readline shortcuts', () => {
    expect(editText(state, 'a', key({ ctrl: true }))?.cursor).toBe(0);
    expect(editText(state, 'e', key({ ctrl: true }))?.cursor).toBe(11);
    expect(editText({ value: 'fix the webhook', cursor: 15 }, 'w', key({ ctrl: true }))).toEqual({ value: 'fix the ', cursor: 8 });
    expect(editText(state, 'u', key({ ctrl: true }))).toEqual({ value: ' webhook', cursor: 0 });
  });

  it('leaves Enter, Esc, Tab and vertical arrows to the owner', () => {
    for (const special of ['return', 'escape', 'tab', 'upArrow', 'downArrow'] as const) {
      expect(editText(state, '', key({ [special]: true }))).toBeNull();
    }
    expect(editText(state, 'k', key({ ctrl: false, meta: true }))).toBeNull();
  });
});

describe('list navigation', () => {
  const start = { index: 0, offset: 0 };

  it('moves with vim keys and arrows within bounds', () => {
    expect(moveInList(start, 'j', key(), 10, 5)).toEqual({ index: 1, offset: 0 });
    expect(moveInList(start, '', key({ downArrow: true }), 10, 5)).toEqual({ index: 1, offset: 0 });
    expect(moveInList(start, 'k', key(), 10, 5)).toEqual({ index: 0, offset: 0 });
    expect(moveInList(start, 'G', key(), 10, 5)).toEqual({ index: 9, offset: 5 });
    expect(moveInList({ index: 9, offset: 5 }, 'g', key(), 10, 5)).toEqual({ index: 0, offset: 0 });
  });

  it('scrolls the viewport to keep the selection visible', () => {
    expect(moveInList({ index: 4, offset: 0 }, 'j', key(), 10, 5)).toEqual({ index: 5, offset: 1 });
    expect(clampList({ index: 20, offset: 0 }, 3, 5)).toEqual({ index: 2, offset: 0 });
    expect(clampList({ index: 0, offset: 0 }, 0, 5)).toEqual({ index: 0, offset: 0 });
  });

  it('ignores letters when vim keys are off or a modifier is held', () => {
    expect(moveInList(start, 'j', key(), 10, 5, false)).toBeNull();
    expect(moveInList({ index: 3, offset: 0 }, 'k', key({ ctrl: true }), 10, 5)).toBeNull();
    expect(moveInList(start, 'x', key(), 10, 5)).toBeNull();
  });
});

describe('KeyDispatcher', () => {
  it('offers keys to higher layers first and stops when one handles it', () => {
    const dispatcher = new KeyDispatcher();
    const calls: string[] = [];
    dispatcher.register(Layer.global, () => {
      calls.push('global');
      return true;
    });
    dispatcher.register(Layer.screen, (input) => {
      calls.push('screen');
      return input === 'p';
    });
    const unregisterOverlay = dispatcher.register(Layer.overlay, () => {
      calls.push('overlay');
      return true;
    });

    dispatcher.dispatch('p', key());
    expect(calls).toEqual(['overlay']);

    unregisterOverlay();
    calls.length = 0;
    dispatcher.dispatch('p', key());
    expect(calls).toEqual(['screen']);

    calls.length = 0;
    dispatcher.dispatch('?', key());
    expect(calls).toEqual(['screen', 'global']);
  });
});
