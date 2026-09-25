import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type Hint = readonly [keys: string, action: string];

interface Chrome {
  hints: readonly Hint[];
  setHints: (hints: readonly Hint[]) => void;
}

const ChromeContext = createContext<Chrome | null>(null);
/** Whether the screen (or window) around a component is the one on top. */
const ActiveContext = createContext(true);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [hints, setState] = useState<readonly Hint[]>([]);
  // Same shortcuts again (every render of a screen declares them) change nothing.
  const setHints = useCallback((next: readonly Hint[]) => setState((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next)), []);
  const value = useMemo(() => ({ hints, setHints }), [hints, setHints]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function ActiveScope({ active, children }: { active: boolean; children: ReactNode }) {
  return <ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>;
}

export function useIsActive(): boolean {
  return useContext(ActiveContext);
}

export function useChromeHints(): readonly Hint[] {
  return useContext(ChromeContext)?.hints ?? [];
}

/** The shortcuts shown in the status bar, while the screen or window that declares them is on top. */
export function useHints(hints: readonly Hint[]): void {
  const setHints = useContext(ChromeContext)?.setHints;
  const active = useIsActive();
  const key = JSON.stringify(hints);
  useLayoutEffect(() => {
    if (active) setHints?.(hints);
    // `key` stands for the hints' content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, setHints]);
}
