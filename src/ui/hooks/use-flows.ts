import { basename } from 'node:path';
import type { Project } from '../../domain/entities.js';
import { deriveProjectKey } from '../../domain/naming.js';
import { toDisplayError } from '../../utils/errors.js';
import { tildify } from '../../utils/text.js';
import type { PickerOption } from '../overlays/types.js';
import { useAppState } from '../app-state.js';

const ADD = '__add-parent__';
const TYPE = '__type-path__';
const UNLINK = '__unlink__';
const MISSING = '__missing__:';

/** Workspace-level flows, shared by their screens and the command palette. */
export function useFlows() {
  const { services, session, setSession, openOverlay, run, notify, go, cwd } = useAppState();

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

  /** Adds a parent folder, then continues with `next` (e.g. reopening the picker). */
  const addParentFolder = (next?: () => unknown) =>
    openOverlay({
      kind: 'prompt',
      title: 'Add parent folder',
      context: 'a folder that contains your repositories',
      placeholder: '~/workspace/products',
      onSubmit: async (path) => {
        const ok = await run(async () => services.folders.add(path), `Added ${path.trim()}`);
        if (ok && next) await next();
        return ok;
      },
    });

  const typeRepositoryPath = (project: Project) =>
    openOverlay({
      kind: 'prompt',
      title: 'Repository path',
      context: project.name,
      initial: project.repositoryPath ?? cwd,
      onSubmit: (path) => run(() => services.projects.linkRepository(session, project, path), `${project.name} linked to ${path.trim()}`),
    });

  /**
   * Visual repository picker: every subfolder of every parent folder, like
   * `ls -1`, filterable by typing. Git repositories are marked; folders
   * already linked to another project say so.
   */
  const pickRepository = async (project: Project): Promise<void> => {
    let parents;
    try {
      parents = services.folders.browse();
    } catch (error) {
      const display = toDisplayError(error);
      notify(display.message, 'error', display.hint);
      return;
    }
    if (parents.length === 0) {
      addParentFolder(() => pickRepository(project));
      return;
    }

    const projects = await services.projects.list(session);
    const linkedTo = new Map(projects.flatMap((p) => (p.repositoryPath && p.id !== project.id ? [[p.repositoryPath, p.name] as const] : [])));
    const names = parents.map((parent) => basename(parent.path));
    const parentLabel = (path: string) => {
      const name = basename(path);
      return names.filter((candidate) => candidate === name).length > 1 ? tildify(path) : name;
    };

    const folders: PickerOption[] = parents.flatMap((parent): PickerOption[] =>
      parent.available
        ? parent.children.map((child) => {
            const other = linkedTo.get(child.path);
            return {
              value: child.path,
              label: `${parentLabel(parent.path)}/${child.name}`,
              hint: !child.isGitRepository ? 'not a Git repository' : other ? `git · linked to ${other}` : 'git',
              dim: !child.isGitRepository,
            };
          })
        : [{ value: `${MISSING}${parent.path}`, label: `${tildify(parent.path)}  (folder not found)`, dim: true }],
    );
    const actions: PickerOption[] = [
      { value: ADD, label: '+ Add parent folder…', hint: `${parents.length} registered` },
      { value: TYPE, label: 'Type a path…' },
      ...(project.repositoryPath ? [{ value: UNLINK, label: 'Unlink repository', hint: tildify(project.repositoryPath) }] : []),
    ];

    openOverlay({
      kind: 'picker',
      title: `Repository for ${project.name}`,
      context: 'type to filter',
      options: [...folders, ...actions],
      initial: project.repositoryPath,
      filterable: true,
      onSelect: (value) => {
        if (value === ADD) return void addParentFolder(() => pickRepository(project));
        if (value === TYPE) return void typeRepositoryPath(project);
        if (value === UNLINK) return run(() => services.projects.unlinkRepository(session, project), `${project.name} unlinked`);
        if (value.startsWith(MISSING)) {
          notify('That parent folder no longer exists.', 'error', 'Remove it from Parent folders in the command palette.');
          return false;
        }
        if (!folders.find((option) => option.value === value && !option.dim)) {
          notify(`${tildify(value)} is not a Git repository.`, 'error', 'Run `git init` there, or pick another folder.');
          return false;
        }
        return run(() => services.projects.linkRepository(session, project, value), `${project.name} linked to ${tildify(value)}`);
      },
    });
  };

  const manageRepositories = async (project: Project): Promise<void> => {
    const current = (await services.projects.list(session)).find((item) => item.id === project.id);
    if (!current) return;
    const options: PickerOption[] = [
      ...current.repositories.flatMap((repository) => [
        ...(repository.name === 'default' ? [{ value: `default:${repository.id}`, label: `default · ${repository.localPath ? tildify(repository.localPath) : 'not linked here'}`, hint: 'primary repository · link with r', dim: true }] : [{ value: `remove:${repository.id}`, label: `${repository.name} · ${repository.localPath ? tildify(repository.localPath) : 'not linked here'}`, hint: repository.repositoryUrl ?? undefined }]),
        ...(!repository.localPath && repository.name !== 'default' ? [{ value: `link:${repository.id}`, label: `Link ${repository.name} on this machine…`, hint: 'choose a local Git folder' }] : []),
      ]),
      { value: '__add__', label: '+ Add repository…', hint: 'name and local path' },
    ];
    openOverlay({
      kind: 'picker', title: `Repositories · ${project.key}`, context: 'Each task can target one of these repositories.', options, filterable: true,
      onSelect: (value) => {
        if (value === '__add__') {
          openOverlay({
            kind: 'prompt', title: 'Repository name', context: 'Examples: frontend, backend, worker-queue', placeholder: 'backend',
            onSubmit: (name) => openOverlay({
              kind: 'prompt', title: `Folder for ${name.trim()}`, context: 'local path for this machine', initial: cwd,
              onSubmit: (path) => run(() => services.projects.addRepository(session, project, { name, path }), `${name.trim()} repository added to ${project.key}`),
            }),
          });
          return;
        }
        if (value.startsWith('default:')) return notify('The default repository is managed with the project link action (`r`).', 'info');
        if (value.startsWith('link:')) {
          const repository = current.repositories.find((candidate) => candidate.id === value.slice('link:'.length));
          if (!repository) return;
          return openOverlay({ kind: 'prompt', title: `Local folder · ${repository.name}`, context: 'this path stays on this machine', initial: cwd, onSubmit: (path) => run(() => services.projects.linkProjectRepository(session, project, repository.id, path), `${repository.name} linked to ${tildify(path.trim())}`) });
        }
        const id = value.slice('remove:'.length);
        const repository = current.repositories.find((candidate) => candidate.id === id);
        if (!repository) return;
        openOverlay({ kind: 'confirm', title: `Remove ${repository.name}?`, context: 'Tasks routed here will return to automatic selection.', confirmLabel: 'Remove repository', tone: 'danger', onConfirm: () => run(() => services.projects.removeRepository(session, project, id), `${repository.name} removed from ${project.key}`) });
      },
    });
  };

  const prompt = (project: Project, field: 'name' | 'description' | 'repositoryUrl', title: string, placeholder: string) =>
    openOverlay({
      kind: 'prompt',
      title,
      context: `${project.key} · ${project.name}`,
      initial: project[field] ?? '',
      placeholder,
      allowEmpty: field !== 'name',
      onSubmit: (value) => run(() => services.projects.update(session, project, { [field]: value }), `${project.key} updated`),
    });

  return {
    switchWorkspace,
    pickRepository,
    manageRepositories,
    addParentFolder,

    /** Name, description and repository URL. The key stays (people and scripts use it). */
    editProject(project: Project) {
      openOverlay({
        kind: 'picker',
        title: 'Edit project',
        context: `${project.key} · ${project.name}`,
        options: [
          { value: 'name', label: 'Name', hint: project.name },
          { value: 'description', label: 'Description', hint: project.description ?? '—' },
          { value: 'repositoryUrl', label: 'Repository URL', hint: project.repositoryUrl ?? '—' },
          { value: 'repo', label: 'Linked folder on this machine…', hint: project.repositoryPath ? tildify(project.repositoryPath) : 'r' },
        ],
        onSelect: (value) => {
          if (value === 'name') prompt(project, 'name', 'Project name', 'EnrollBridge');
          else if (value === 'description') prompt(project, 'description', 'Description', 'What this project is');
          else if (value === 'repositoryUrl') prompt(project, 'repositoryUrl', 'Repository URL', 'https://github.com/org/repo');
          else if (value === 'repo') void pickRepository(project);
        },
      });
    },

    /** Lists parent folders; choosing one offers to remove it. */
    manageParentFolders() {
      const parents = services.folders.browse();
      openOverlay({
        kind: 'picker',
        title: 'Parent folders',
        context: 'where your repositories live',
        options: [
          ...parents.map((parent) => ({
            value: parent.path,
            label: tildify(parent.path),
            hint: parent.available ? `${parent.children.length} folders` : 'not found',
            dim: !parent.available,
          })),
          { value: ADD, label: '+ Add parent folder…' },
        ],
        filterable: parents.length > 8,
        onSelect: (value) => {
          if (value === ADD) return void addParentFolder();
          openOverlay({
            kind: 'picker',
            title: `Remove ${tildify(value)}?`,
            context: 'only forgets it; nothing is deleted from disk',
            options: [
              { value: 'remove', label: 'Remove from parent folders' },
              { value: 'cancel', label: 'Cancel', dim: true },
            ],
            onSelect: (answer) =>
              answer === 'remove' ? run(async () => services.folders.remove(value), `Removed ${tildify(value)}`) : undefined,
          });
        },
      });
    },

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
      const remote = services.environment.mode === 'remote';
      openOverlay({
        kind: 'prompt',
        title: 'Add developer',
        context: remote ? `${session.workspace.name} · GitHub login of someone who ran soja login` : session.workspace.name,
        placeholder: 'username, e.g. angel',
        onSubmit: (username) =>
          remote
            ? run(() => services.workspaces.addMember(session, { username }), `@${username.trim().replace(/^@/, '').toLowerCase()} joined ${session.workspace.name}`)
            : openOverlay({
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
