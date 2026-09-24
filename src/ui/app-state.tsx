import { useApp } from 'ink';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { toDisplayError } from '../utils/errors.js';
import { navigate, type NavigationAction, type Route } from './navigation/routes.js';
import type { Overlay } from './overlays/types.js';

export interface Flash {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
  hint?: string | undefined;
}

export interface AppState {
  services: AppServices;
  /** Directory SOJA was opened from; Git features use it to find the repository. */
  cwd: string;
  session: Session;
  setSession(session: Session): void;
  stack: readonly Route[];
  route: Route;
  go(action: NavigationAction): void;
  overlay: Overlay | null;
  openOverlay(overlay: Overlay): void;
  /** Closes `which` if it is still open (or whatever is open). A handler that opened a follow-up overlay is not undone. */
  closeOverlay(which?: Overlay): void;
  flash: Flash | null;
  notify(text: string, tone?: Flash['tone'], hint?: string): void;
  /** Bumps after every successful mutation; data hooks reload on change. */
  revision: number;
  /**
   * Runs a mutation: on success refreshes data and optionally confirms;
   * on failure shows a friendly error. Resolves to whether it worked.
   */
  run(action: () => Promise<unknown>, success?: string): Promise<boolean>;
  /** Reloads screen data after changes made outside `run` (e.g. Git operations). */
  refresh(): void;
  /**
   * Looks for task branches merged outside SOJA and closes those tasks.
   * Full scans are throttled; `only` checks one task right away.
   */
  detectMerges(only?: string): Promise<void>;
  quit(): void;
}

const AppStateContext = createContext<AppState | null>(null);

interface ProviderProps {
  services: AppServices;
  cwd: string;
  initialSession: Session;
  children: ReactNode;
}

export function AppStateProvider({ services, cwd, initialSession, children }: ProviderProps) {
  const { exit } = useApp();
  const [session, setSession] = useState(initialSession);
  const [stack, dispatch] = useReducer(navigate, [{ name: 'home' }] as Route[]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [flash]);

  const notify = useCallback((text: string, tone: Flash['tone'] = 'info', hint?: string) => {
    setFlash({ id: Date.now(), text, tone, hint });
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        setRevision((value) => value + 1);
        if (success) notify(success, 'success');
        return true;
      } catch (error) {
        const display = toDisplayError(error);
        notify(display.message, 'error', display.hint);
        return false;
      }
    },
    [notify],
  );

  const lastScan = useRef(0);
  const detectMerges = useCallback(
    async (only?: string) => {
      if (!only) {
        if (Date.now() - lastScan.current < 10_000) return;
        lastScan.current = Date.now();
      }
      try {
        const merged = (await services.git.detectMerges(session, cwd, only ? { only } : {})).filter(
          (result) => result.kind === 'merged',
        );
        const [first] = merged;
        if (!first) return;
        notify(
          merged.length === 1
            ? `${first.task.ref} was merged into ${first.into} outside SOJA → Done`
            : `${merged.length} tasks were merged outside SOJA → Done`,
          'success',
        );
        setRevision((value) => value + 1);
      } catch {
        // Detection is best effort; the task views report Git problems themselves.
      }
    },
    [services, session, cwd, notify],
  );

  const changeSession = useCallback((next: Session) => {
    setSession(next);
    dispatch({ type: 'reset' });
    setRevision((value) => value + 1);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      services,
      cwd,
      session,
      setSession: changeSession,
      stack,
      route: stack.at(-1) ?? { name: 'home' },
      go: dispatch,
      overlay,
      openOverlay: setOverlay,
      closeOverlay: (which?: Overlay) => setOverlay((current) => (!which || current === which ? null : current)),
      flash,
      notify,
      revision,
      run,
      refresh: () => setRevision((value) => value + 1),
      detectMerges,
      quit: exit,
    }),
    [services, cwd, session, changeSession, stack, overlay, flash, notify, revision, run, detectMerges, exit],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used inside <AppStateProvider>');
  return state;
}
