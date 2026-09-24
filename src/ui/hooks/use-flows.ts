import { deriveProjectKey } from '../../domain/naming.js';
import { useAppState } from '../app-state.js';

/** Workspace-level flows, shared by their screens and the command palette. */
export function useFlows() {
  const { services, session, setSession, openOverlay, run, notify, go } = useAppState();

  const switchWorkspace = async (id: string): Promise<boolean> => {
    if (id === session.workspace.id) return true;
    let next: Awaited<ReturnType<typeof services.workspaces.switchTo>> | undefined;
    const ok = await run(async () => {
      next = await services.workspaces.switchTo(session.user, id);
    });
    if (ok && next) {
      setSession(next);
      notify(`Now in ${next.workspace.name}`, 'success');
    }
    return ok;
  };

  return {
    switchWorkspace,

    newProject() {
      openOverlay({
        kind: 'prompt',
        title: 'New project',
        context: session.workspace.name,
        placeholder: 'EnrollBridge',
        // The key prompt replaces this one: confirm or change the derived key.
        onSubmit: (name) =>
          openOverlay({
            kind: 'prompt',
            title: 'Project key',
            context: name.trim(),
            initial: deriveProjectKey(name),
            onSubmit: (key) => run(() => services.projects.create(session, { name, key }), `Project ${name.trim()} created`),
          }),
      });
    },

    addDeveloper() {
      openOverlay({
        kind: 'prompt',
        title: 'Add developer',
        context: session.workspace.name,
        placeholder: 'username, e.g. angel',
        onSubmit: (username) =>
          openOverlay({
            kind: 'prompt',
            title: 'Display name',
            context: `@${username.trim().toLowerCase()}`,
            initial: username.trim().replace(/^./, (char) => char.toUpperCase()),
            onSubmit: (displayName) =>
              run(
                () => services.workspaces.addMember(session, { username, displayName }),
                `@${username.trim().toLowerCase()} joined ${session.workspace.name}`,
              ),
          }),
      });
    },

    newWorkspace() {
      openOverlay({
        kind: 'prompt',
        title: 'New workspace',
        placeholder: 'Freelance',
        onSubmit: async (name) => {
          let createdId: string | undefined;
          const ok = await run(async () => {
            createdId = (await services.workspaces.create(session.user, { name })).id;
          });
          return ok && createdId ? switchWorkspace(createdId) : ok;
        },
      });
    },

    async pickWorkspace() {
      const workspaces = await services.workspaces.list(session.user);
      openOverlay({
        kind: 'picker',
        title: 'Switch workspace',
        options: workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name, hint: workspace.slug })),
        initial: session.workspace.id,
        filterable: true,
        onSelect: switchWorkspace,
      });
    },

    async pickProject() {
      const projects = await services.projects.list(session);
      openOverlay({
        kind: 'picker',
        title: 'Switch project',
        options: projects.map((project) => ({ value: project.id, label: project.name, hint: `${project.key} · ${project.active} active` })),
        filterable: true,
        onSelect: (projectId) => go({ type: 'reset', route: { name: 'project', projectId } }),
      });
    },
  };
}
