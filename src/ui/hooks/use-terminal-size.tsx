import { useWindowSize } from 'ink';
import { createContext, useContext, type ReactNode } from 'react';

const SizeContext = createContext<{ columns: number; rows: number } | null>(null);

/**
 * One resize listener for the whole app. Ink's `useWindowSize` adds a
 * listener per component; with dozens of panels that trips Node's
 * "possible EventEmitter leak" warning and re-renders each one separately.
 */
export function TerminalSizeProvider({ children }: { children: ReactNode }) {
  const { columns, rows } = useWindowSize();
  return <SizeContext.Provider value={{ columns, rows }}>{children}</SizeContext.Provider>;
}

export function useTerminalSize(): { columns: number; rows: number } {
  const size = useContext(SizeContext);
  // Outside the provider (isolated component tests): fall back to Ink's own hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return size ?? useWindowSize();
}
