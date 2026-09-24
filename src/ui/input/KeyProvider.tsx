import { useInput } from 'ink';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { KeyDispatcher, type KeyHandler, type Layer } from './dispatcher.js';

const KeyContext = createContext<KeyDispatcher | null>(null);

export function KeyProvider({ children }: { children: ReactNode }) {
  const [dispatcher] = useState(() => new KeyDispatcher());
  useInput((input, key) => {
    dispatcher.dispatch(input, key);
  });
  return <KeyContext.Provider value={dispatcher}>{children}</KeyContext.Provider>;
}

/**
 * Registers `handler` on a layer while `active`. The latest handler is always used.
 * Layout effects register during the commit itself, so a key typed right after
 * opening an overlay reaches the overlay, not the shortcut underneath it.
 */
export function useKeys(layer: Layer, handler: KeyHandler, active = true): void {
  const dispatcher = useContext(KeyContext);
  if (!dispatcher) throw new Error('useKeys must be used inside <KeyProvider>');
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useLayoutEffect(() => {
    if (!active) return;
    return dispatcher.register(layer, (input, key) => latest.current(input, key));
  }, [dispatcher, layer, active]);
}
