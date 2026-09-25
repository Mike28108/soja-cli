import { useApp, useInput, useStdout, type DOMElement } from 'ink';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { KeyDispatcher, Layer, type KeyHandler } from './dispatcher.js';
import { MOUSE_OFF, MOUSE_ON, MouseDispatcher, parseMouse, rectOf, type MouseTarget } from './mouse.js';

interface InputContext {
  keys: KeyDispatcher;
  mouse: MouseDispatcher;
  /** Whether the terminal reports the mouse (off with SOJA_MOUSE=0 and in tests). */
  mouseEnabled: boolean;
}

const InputContext = createContext<InputContext | null>(null);

/**
 * All input goes through here: keys to the layered key dispatcher, mouse
 * reports to the clickable regions. A mouse report never reaches a key handler.
 */
export function KeyProvider({ children, mouse = false }: { children: ReactNode; mouse?: boolean }) {
  const [context] = useState<InputContext>(() => ({ keys: new KeyDispatcher(), mouse: new MouseDispatcher(), mouseEnabled: mouse }));
  const { stdout } = useStdout();

  useInput((input, key) => {
    const event = parseMouse(input);
    if (event) context.mouse.dispatch(event);
    else context.keys.dispatch(input, key);
  });

  useEffect(() => {
    if (!mouse) return;
    stdout.write(MOUSE_ON);
    // Whatever way SOJA ends, the terminal must stop sending mouse reports.
    const off = () => stdout.write(MOUSE_OFF);
    process.once('exit', off);
    return () => {
      off();
      process.off('exit', off);
    };
  }, [mouse, stdout]);

  return <InputContext.Provider value={context}>{children}</InputContext.Provider>;
}

function useInputContext(): InputContext {
  const context = useContext(InputContext);
  if (!context) throw new Error('Input hooks must be used inside <KeyProvider>');
  return context;
}

/**
 * Registers `handler` on a layer while `active`. The latest handler is always used.
 * Layout effects register during the commit itself, so a key typed right after
 * opening an overlay reaches the overlay, not the shortcut underneath it.
 */
export function useKeys(layer: Layer, handler: KeyHandler, active = true): void {
  const { keys } = useInputContext();
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useLayoutEffect(() => {
    if (!active) return;
    return keys.register(layer, (input, key) => latest.current(input, key));
  }, [keys, layer, active]);
}

/**
 * Makes the element behind `ref` react to clicks and the wheel while `active`.
 * Its position is read from the layout when the event arrives, so it follows
 * scrolling and resizing.
 */
export function useClickable(ref: RefObject<DOMElement | null>, target: MouseTarget, options: { layer?: Layer; active?: boolean } = {}): void {
  const { mouse } = useInputContext();
  const latest = useRef(target);
  useLayoutEffect(() => {
    latest.current = target;
  });
  const layer = options.layer ?? Layer.screen;
  const active = options.active ?? true;
  useLayoutEffect(() => {
    if (!active) return;
    return mouse.register(layer, () => rectOf(ref.current), () => latest.current);
  }, [mouse, layer, active, ref]);
}

/**
 * Hands the terminal to another program (an editor, Git asking for a
 * password) and takes it back. The mouse is switched off meanwhile, so the
 * program does not receive mouse reports as typed text.
 */
export function useExternalTerminal(): <T>(work: () => Promise<T>) => Promise<T> {
  const { suspendTerminal } = useApp();
  const { stdout } = useStdout();
  const { mouseEnabled } = useInputContext();
  return useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      let result: T | undefined;
      if (mouseEnabled) stdout.write(MOUSE_OFF);
      try {
        await suspendTerminal(async () => {
          result = await work();
        });
      } finally {
        if (mouseEnabled) stdout.write(MOUSE_ON);
      }
      return result as T;
    },
    [suspendTerminal, stdout, mouseEnabled],
  );
}
