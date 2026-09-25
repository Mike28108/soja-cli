import { useApp } from 'ink';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppServices } from '../application/services/index.js';
import type { SyncReport, SyncStatus } from '../data/sync/engine.js';
import type { Session } from '../application/types.js';
import type { TaskFilter } from '../application/filters.js';
import type { UpdateCheck } from '../application/services/update-service.js';
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
  /** Version of explicitly invalidated data topics, used for selective refreshes. */
  queryVersion(topics: readonly string[]): string;
  invalidateQueries(topics: readonly string[]): void;
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
  /**
   * Learns what happened on GitHub (merged pull requests close their tasks,
   * failing checks are recorded). Full scans are throttled; `only` checks one task.
   */
  followPullRequests(only?: string): Promise<void>;
  /** Remote mode: pending changes, connectivity and the last sync. Null in local mode. */
  syncStatus: SyncStatus | null;
  /** The filter of the home list, shared by its tabs and the sidebar. */
  homeFilter: TaskFilter;
  setHomeFilter(filter: TaskFilter): void;
  quit(): void;
}

const AppStateContext = createContext<AppState | null>(null);

interface ProviderProps {
  services: AppServices;
  cwd: string;
  initialSession: Session;
  initialRoute?: Route;
  updates?: () => Promise<UpdateCheck | null>;
  children: ReactNode;
}

export function AppStateProvider({ services, cwd, initialSession, initialRoute, updates, children }: ProviderProps) {
  const { exit } = useApp();
  const [session, setSession] = useState(initialSession);
  const [stack, dispatch] = useReducer(navigate, navigate([{ name: 'home' }], { type: 'reset', ...(initialRoute ? { route: initialRoute } : {}) }));
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [revision, setRevision] = useState(0);
  const [queryEpochs, setQueryEpochs] = useState<Record<string, number>>({});
  const [homeFilter, setHomeFilter] = useState<TaskFilter>(initialRoute?.name === 'home' && initialRoute.filter ? initialRoute.filter : 'mine');

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [flash]);

  const notify = useCallback((text: string, tone: Flash['tone'] = 'info', hint?: string) => {
    setFlash({ id: Date.now(), text, tone, hint });
  }, []);

  const queryVersion = useCallback((topics: readonly string[]) => topics.map((topic) => `${topic}:${queryEpochs[topic] ?? 0}`).join('|'), [queryEpochs]);
  const invalidateQueries = useCallback((topics: readonly string[]) => {
    if (topics.length === 0) return;
    setQueryEpochs((current) => {
      const next = { ...current };
      for (const topic of new Set(topics)) next[topic] = (next[topic] ?? 0) + 1;
      return next;
    });
  }, []);

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Once per launch, and at most one GitHub request a day.
  useEffect(() => {
    if (!updates) return;
    let active = true;
    void updates().then((update) => {
      if (active && update?.available) notify(`SOJA v${update.latest} is available`, 'info', 'Run `soja update` to install it.');
    });
    return () => {
      active = false;
    };
  }, [updates, notify]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        setRevision((value) => value + 1);
        if (services.sync) void services.sync.status(session.workspace.id).then(setSyncStatus);
        if (success) notify(success, 'success');
        return true;
      } catch (error) {
        const display = toDisplayError(error);
        notify(display.message, 'error', display.hint);
        return false;
      }
    },
    [notify, services, session.workspace.id],
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

  const lastPrScan = useRef(0);
  const followPullRequests = useCallback(
    async (only?: string) => {
      if (!only) {
        if (Date.now() - lastPrScan.current < 120_000) return;
        lastPrScan.current = Date.now();
      }
      try {
        const updates = await services.git.followPullRequests(session, cwd, only ? { only } : {});
        const merged = updates.filter((update) => update.kind === 'merged');
        const failed = updates.filter((update) => update.kind === 'checks_failed');
        const [firstMerged] = merged;
        const [firstFailed] = failed;
        if (firstMerged) {
          notify(
            merged.length === 1
              ? `${firstMerged.task.ref}: PR #${firstMerged.pr.number} was merged on GitHub → Done`
              : `${merged.length} pull requests were merged on GitHub → Done`,
            'success',
          );
        } else if (firstFailed) {
          notify(
            failed.length === 1
              ? `${firstFailed.task.ref}: checks failed on PR #${firstFailed.pr.number} (${firstFailed.pr.checks.failing.join(', ')})`
              : `Checks failed on ${failed.length} pull requests`,
            'error',
          );
        }
        if (updates.length) setRevision((value) => value + 1);
      } catch {
        // Best effort: without gh, or offline, there is simply nothing new.
      }
    },
    [services, session, cwd, notify],
  );

  // Remote mode: sync on launch, every 30 s and shortly after changes; refresh views when it finishes.
  useEffect(() => {
    const sync = services.sync;
    if (!sync) return;
    const workspaceId = session.workspace.id;
    let active = true;
    const updateStatus = () => {
      void sync.status(workspaceId).then((status) => {
        if (active) setSyncStatus(status);
      });
    };
    // A sync only invalidates queries for entities that actually changed in the replica.
    const onSync = (report: SyncReport | null) => {
      updateStatus();
      if (!report || !active) return;
      const topics: string[] = [];
      if (report.changes.taskRefs.length) {
        topics.push(`tasks:${workspaceId}`, `projects:${workspaceId}`, `sidebar-tasks:${workspaceId}`);
        for (const ref of report.changes.taskRefs) topics.push(`task:${workspaceId}:${ref}`);
      }
      if (report.changes.projects) topics.push(`projects:${workspaceId}`);
      if (report.changes.members) topics.push(`members:${workspaceId}`);
      if (report.changes.chatChannelIds.length || report.changes.chatReads) {
        topics.push(`chat-channels:${workspaceId}`, `sidebar-channels:${workspaceId}`, `chat-totals:${workspaceId}`);
      }
      for (const channelId of report.changes.chatMessageChannelIds) {
        topics.push(`chat:${workspaceId}`, `chat-messages:${channelId}`, `chat-channels:${workspaceId}`, `sidebar-channels:${workspaceId}`, `chat-totals:${workspaceId}`, `chat-notices:${workspaceId}`);
      }
      invalidateQueries(topics);
      if (report.chatRejected) notify(`Chat: ${report.chatRejected} message change${report.chatRejected === 1 ? '' : 's'} not applied`, 'error', 'Open the chat (#) to get your text back.');
      else if (report.conflicts || report.rejected) {
        const parts = [
          report.conflicts && `${report.conflicts} conflict${report.conflicts === 1 ? '' : 's'}`,
          report.rejected && `${report.rejected} rejected change${report.rejected === 1 ? '' : 's'}`,
        ];
        notify(`Sync: ${parts.filter(Boolean).join(', ')}`, 'error', 'Open the task and press ! to review.');
      }
    };
    const runSync = () => sync.syncNow(workspaceId);
    const unsubscribe = sync.subscribe(onSync);
    updateStatus();
    // Real time (chat and "something changed"); each connection starts with a sync.
    const stopLive = sync.startLive(workspaceId);
    void runSync();
    const interval = setInterval(() => void runSync(), 30_000);
    return () => {
      active = false;
      unsubscribe();
      stopLive();
      clearInterval(interval);
    };
  }, [services, session.workspace.id, notify, invalidateQueries]);

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
      queryVersion,
      invalidateQueries,
      run,
      refresh: () => setRevision((value) => value + 1),
      detectMerges,
      followPullRequests,
      syncStatus,
      homeFilter,
      setHomeFilter,
      quit: exit,
    }),
    [services, cwd, session, changeSession, stack, overlay, flash, notify, revision, queryVersion, invalidateQueries, run, detectMerges, followPullRequests, syncStatus, homeFilter, exit],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used inside <AppStateProvider>');
  return state;
}
