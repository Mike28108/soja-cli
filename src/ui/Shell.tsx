import { Box } from 'ink';
import { useEffect } from 'react';
import { useAppState } from './app-state.js';
import { ActiveScope, ChromeProvider, useChromeHints } from './chrome/context.js';
import { Sidebar } from './chrome/Sidebar.js';
import { StatusBar } from './chrome/StatusBar.js';
import { Toast } from './chrome/Toast.js';
import { TopBar } from './chrome/TopBar.js';
import { useCommandPalette } from './hooks/use-commands.js';
import { useLayout } from './hooks/use-layout.js';
import { useQuery } from './hooks/use-query.js';
import { Layer } from './input/dispatcher.js';
import { useKeys } from './input/KeyProvider.js';
import type { SyncStatus } from '../data/sync/engine.js';
import type { Route } from './navigation/routes.js';
import { CommitOverlay } from './overlays/CommitOverlay.js';
import { ConfirmOverlay } from './overlays/ConfirmOverlay.js';
import { GitLogOverlay } from './overlays/GitLogOverlay.js';
import { GitRunOverlay } from './overlays/GitRunOverlay.js';
import { NewTaskOverlay } from './overlays/NewTaskOverlay.js';
import { PickerOverlay } from './overlays/PickerOverlay.js';
import { PromptOverlay } from './overlays/PromptOverlay.js';
import { SearchOverlay } from './overlays/SearchOverlay.js';
import type { Overlay } from './overlays/types.js';
import { HelpScreen } from './screens/HelpScreen.js';
import { ProjectsScreen } from './screens/ProjectsScreen.js';
import { TaskListScreen } from './screens/TaskListScreen.js';
import { TaskScreen } from './screens/TaskScreen.js';
import { WorkspacesScreen } from './screens/WorkspacesScreen.js';
import { ChatScreen } from './screens/ChatScreen.js';

/**
 * The running app, laid out like a desktop application: title bar, sidebar,
 * the screen stack in the main area, status bar, and floating windows and
 * notices on top. Screens below the top stay mounted (hidden) so going back
 * restores the selection you left.
 */
export function Shell() {
  return (
    <ChromeProvider>
      <Frame />
    </ChromeProvider>
  );
}

function Frame() {
  const { session, services, stack, route, overlay, openOverlay, go, quit, cwd, detectMerges, followPullRequests, syncStatus } = useAppState();
  const hints = useChromeHints();
  // New tasks default to the open project, or to the project linked to the repository SOJA runs in.
  const here = useQuery(async () => (await services.projects.findByRepository(session, cwd))?.id ?? null, `cwd:${session.workspace.id}`);
  const routeProjectId = route.name === 'project' ? route.projectId : null;
  const newTaskProjectId = routeProjectId ?? here.data ?? null;
  const openPalette = useCommandPalette(newTaskProjectId);

  const projectId = routeProjectId;
  const project = useQuery(
    async () => (projectId ? (await services.projects.get(session, projectId)).name : null),
    `header:${projectId ?? ''}`,
  );

  const chat = services.chat;
  const chatTotals = useQuery(async () => (chat ? chat.totals(session) : null), `chat-totals:${session.workspace.id}`);

  // On launch and whenever you come back to a task list, catch merges done elsewhere.
  const onList = route.name === 'home' || route.name === 'project';
  useEffect(() => {
    if (onList && !overlay) {
      void detectMerges();
      void followPullRequests();
    }
  }, [onList, overlay, stack.length, detectMerges, followPullRequests]);

  // With SOJA open, GitHub is checked every few minutes (merges and CI happen there).
  useEffect(() => {
    const timer = setInterval(() => void followPullRequests(), 180_000);
    return () => clearInterval(timer);
  }, [followPullRequests]);

  useKeys(Layer.global, (input, key) => {
    if (input === ':' || (key.ctrl && input === 'k')) openPalette();
    else if (key.ctrl || key.meta) return false;
    else if (input === '/') openOverlay({ kind: 'search' });
    else if (input === 'n') openOverlay({ kind: 'new-task', projectId: newTaskProjectId });
    else if (input === '?') go({ type: 'push', route: { name: 'help' } });
    else if (input === 'p') go({ type: 'push', route: { name: 'projects' } });
    else if (input === 'w') go({ type: 'push', route: { name: 'workspaces' } });
    else if (input === '#' && chat) go({ type: 'push', route: { name: 'chat' } });
    else if (key.escape && stack.length > 1) go({ type: 'pop' });
    else if (input === 'q') {
      if (stack.length > 1) go({ type: 'pop' });
      else quit();
    } else return false;
    return true;
  });

  const { columns, rows, sidebar } = useLayout();
  const { flash } = useAppState();
  const server = services.environment.mode === 'remote' ? new URL(services.environment.server).host : undefined;
  const syncLabel = syncLabelFor(syncStatus);
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <TopBar
        columns={columns}
        workspace={session.workspace.name}
        trail={trailFor(route, project.data)}
        username={session.user.username}
        server={server}
        sync={syncLabel}
        chat={route.name === 'chat' ? undefined : (chatTotals.data ?? undefined)}
      />
      <Box flexGrow={1} flexShrink={1}>
        {sidebar ? <Sidebar width={sidebar} height={rows - 2} active={!overlay} /> : null}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {stack.map((entry, index) => {
            const top = index === stack.length - 1;
            // The screen under a window stays visible, but only the window takes keys and clicks.
            const active = top && !overlay;
            return (
              <Box key={`${index}:${JSON.stringify(entry)}`} display={top ? 'flex' : 'none'} flexDirection="column" flexGrow={1}>
                <ActiveScope active={active}>
                  <ScreenFor route={entry} active={active} />
                </ActiveScope>
              </Box>
            );
          })}
        </Box>
      </Box>
      <StatusBar columns={columns} mode={overlay ? modeForOverlay(overlay) : modeFor(route)} hints={hints} right={server ? undefined : 'local'} />
      {overlay ? (
        <ActiveScope active>
          <OverlayFor overlay={overlay} />
        </ActiveScope>
      ) : null}
      {flash ? <Toast flash={flash} columns={columns} rows={rows} /> : null}
    </Box>
  );
}

function ScreenFor({ route, active }: { route: Route; active: boolean }) {
  switch (route.name) {
    case 'home':
      return <TaskListScreen active={active} {...(route.filter ? { initialFilter: route.filter } : {})} />;
    case 'task':
      return <TaskScreen active={active} taskRef={route.ref} />;
    case 'projects':
      return <ProjectsScreen active={active} />;
    case 'project':
      return <TaskListScreen active={active} projectId={route.projectId} />;
    case 'workspaces':
      return <WorkspacesScreen active={active} />;
    case 'help':
      return <HelpScreen />;
    case 'chat':
      return <ChatScreen active={active} {...(route.channel ? { initialChannel: route.channel } : {})} />;
  }
}

function OverlayFor({ overlay }: { overlay: Overlay }) {
  switch (overlay.kind) {
    case 'confirm':
      return <ConfirmOverlay key={overlay.title + (overlay.context ?? '')} spec={overlay} />;
    case 'picker':
      return <PickerOverlay key={overlay.title + (overlay.context ?? '')} spec={overlay} />;
    case 'prompt':
      return <PromptOverlay key={overlay.title + (overlay.context ?? '')} spec={overlay} />;
    case 'search':
      return <SearchOverlay spec={overlay} />;
    case 'new-task':
      return <NewTaskOverlay spec={overlay} />;
    case 'git-run':
      return <GitRunOverlay key={`${overlay.title}:${overlay.context ?? ''}`} spec={overlay} />;
    case 'commit':
      return <CommitOverlay spec={overlay} />;
    case 'git-log':
      return <GitLogOverlay spec={overlay} />;
  }
}

function trailFor(route: Route, projectName: string | null | undefined): string[] {
  switch (route.name) {
    case 'project':
      return projectName ? ['Projects', projectName] : ['Projects'];
    case 'task':
      return [route.ref];
    case 'projects':
      return ['Projects'];
    case 'workspaces':
      return ['Workspaces'];
    case 'help':
      return ['Help'];
    case 'chat':
      return route.channel ? ['Chat', `#${route.channel.replace(/^#/, '')}`] : ['Chat'];
    case 'home':
      return [];
  }
}

function modeFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return 'Tasks';
    case 'project':
      return 'Project';
    default:
      return route.name;
  }
}

const OVERLAY_MODES: Record<Overlay['kind'], string> = {
  picker: 'Select',
  confirm: 'Confirm',
  prompt: 'Input',
  search: 'Search',
  'new-task': 'New task',
  'git-run': 'Git',
  commit: 'Commit',
  'git-log': 'Git log',
};

function modeForOverlay(overlay: Overlay): string {
  return OVERLAY_MODES[overlay.kind];
}

function syncLabelFor(status: SyncStatus | null): { text: string; tone: 'ok' | 'busy' | 'warn' } | undefined {
  if (!status) return undefined;
  if (status.syncing) return { text: 'syncing…', tone: 'busy' };
  if (status.online === false) return { text: `offline${status.pending ? ` · ${status.pending} pending` : ''}`, tone: 'warn' };
  if (status.pending) return { text: `${status.pending} pending`, tone: status.lastError ? 'warn' : 'busy' };
  return { text: 'synced', tone: 'ok' };
}
