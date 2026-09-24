import { Box } from 'ink';
import { useAppState } from './app-state.js';
import { Header } from './branding/Header.js';
import { useCommandPalette } from './hooks/use-commands.js';
import { useLayout } from './hooks/use-layout.js';
import { useQuery } from './hooks/use-query.js';
import { Layer } from './input/dispatcher.js';
import { useKeys } from './input/KeyProvider.js';
import type { Route } from './navigation/routes.js';
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

/**
 * The running app: compact header, the screen stack and the active overlay.
 * Screens below the top stay mounted (hidden) so going back restores the
 * selection you left.
 */
export function Shell() {
  const { session, services, stack, route, overlay, openOverlay, go, quit } = useAppState();
  const { width } = useLayout();
  const openPalette = useCommandPalette();

  const projectId = route.name === 'project' ? route.projectId : null;
  const project = useQuery(
    async () => (projectId ? (await services.projects.get(session, projectId)).name : null),
    `header:${projectId ?? ''}`,
  );

  useKeys(Layer.global, (input, key) => {
    if (input === ':' || (key.ctrl && input === 'k')) openPalette();
    else if (key.ctrl || key.meta) return false;
    else if (input === '/') openOverlay({ kind: 'search' });
    else if (input === 'n') openOverlay({ kind: 'new-task', projectId });
    else if (input === '?') go({ type: 'push', route: { name: 'help' } });
    else if (input === 'p') go({ type: 'push', route: { name: 'projects' } });
    else if (input === 'w') go({ type: 'push', route: { name: 'workspaces' } });
    else if (key.escape && stack.length > 1) go({ type: 'pop' });
    else if (input === 'q') {
      if (stack.length > 1) go({ type: 'pop' });
      else quit();
    } else return false;
    return true;
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header workspace={session.workspace.name} context={headerContext(route, project.data)} username={session.user.username} width={width} />
      <Box marginTop={1} flexDirection="column">
        {stack.map((entry, index) => {
          const visible = index === stack.length - 1 && !overlay;
          return (
            <Box key={`${index}:${JSON.stringify(entry)}`} display={visible ? 'flex' : 'none'} flexDirection="column">
              <ScreenFor route={entry} active={visible} />
            </Box>
          );
        })}
        {overlay ? <OverlayFor overlay={overlay} /> : null}
      </Box>
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
  }
}

function OverlayFor({ overlay }: { overlay: Overlay }) {
  switch (overlay.kind) {
    case 'picker':
      return <PickerOverlay key={overlay.title + (overlay.context ?? '')} spec={overlay} />;
    case 'prompt':
      return <PromptOverlay key={overlay.title + (overlay.context ?? '')} spec={overlay} />;
    case 'search':
      return <SearchOverlay spec={overlay} />;
    case 'new-task':
      return <NewTaskOverlay spec={overlay} />;
  }
}

function headerContext(route: Route, projectName: string | null | undefined): string | undefined {
  switch (route.name) {
    case 'project':
      return projectName ?? undefined;
    case 'task':
      return route.ref;
    case 'projects':
      return 'Projects';
    case 'workspaces':
      return 'Workspaces';
    case 'help':
      return 'Help';
    case 'home':
      return undefined;
  }
}
