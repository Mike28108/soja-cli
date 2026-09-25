import { FILTER_LABELS, TASK_FILTERS } from '../../application/filters.js';
import { useAppState } from '../app-state.js';
import type { PickerSpec } from '../overlays/types.js';
import { useFlows } from './use-flows.js';

/** The command palette: every major action, filterable by typing. */
export function useCommandPalette(newTaskProjectId: string | null): () => void {
  const { openOverlay, go, quit, services, session, notify, setHomeFilter } = useAppState();
  // Views of home: the filter is shared app state (the sidebar shows it too).
  const showView = (filter: Parameters<typeof setHomeFilter>[0]) => {
    setHomeFilter(filter);
    go({ type: 'reset' });
  };
  const flows = useFlows();

  return () => {
    const commands: { id: string; label: string; key?: string; run: () => unknown }[] = [
      { id: 'new-task', label: 'New task', key: 'n', run: () => openOverlay({ kind: 'new-task', projectId: newTaskProjectId }) },
      ...TASK_FILTERS.map((filter) => ({
        id: `filter-${filter}`,
        label: FILTER_LABELS[filter],
        run: () => showView(filter),
      })),
      { id: 'filter-archived', label: 'Archived tasks', run: () => showView('archived') },
      { id: 'search', label: 'Search', key: '/', run: () => openOverlay({ kind: 'search' }) },
      { id: 'projects', label: 'Projects', key: 'p', run: () => go({ type: 'push', route: { name: 'projects' } }) },
      { id: 'switch-project', label: 'Switch project', run: () => flows.pickProject() },
      { id: 'new-project', label: 'New project', run: () => flows.newProject() },
      { id: 'switch-workspace', label: 'Switch workspace', run: () => flows.pickWorkspace() },
      { id: 'workspaces', label: 'Workspaces', key: 'w', run: () => go({ type: 'push', route: { name: 'workspaces' } }) },
      { id: 'new-workspace', label: 'New workspace', run: () => flows.newWorkspace() },
      { id: 'add-developer', label: 'Add developer', run: () => flows.addDeveloper() },
      { id: 'parent-folders', label: 'Parent folders', run: () => flows.manageParentFolders() },
      { id: 'git-log', label: 'Git log', run: () => openOverlay({ kind: 'git-log' }) },
      ...(services.chat ? [{ id: 'chat', label: 'Chat', key: '#', run: () => go({ type: 'push', route: { name: 'chat' } }) }] : []),
      ...(services.sync
        ? [{
            id: 'sync',
            label: 'Sync now',
            run: async () => {
              await services.sync?.syncNow(session.workspace.id);
              notify('Synced', 'success');
            },
          }]
        : []),
      { id: 'help', label: 'Help', key: '?', run: () => go({ type: 'push', route: { name: 'help' } }) },
      { id: 'quit', label: 'Quit', key: 'q', run: quit },
    ];

    const spec: PickerSpec = {
      kind: 'picker',
      title: 'Commands',
      options: commands.map((command) => ({ value: command.id, label: command.label, ...(command.key ? { hint: command.key } : {}) })),
      filterable: true,
      onSelect: (id) => {
        // Commands may open their own overlay; the palette only closes itself if still on top.
        void commands.find((command) => command.id === id)?.run();
      },
    };
    openOverlay(spec);
  };
}
