import type { TaskView } from '../../application/types.js';
import { pullRequestWarnings } from '../../application/services/index.js';
import {
  isClosed,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '../../domain/task.js';
import { toDisplayError } from '../../utils/errors.js';
import { tildify } from '../../utils/text.js';
import { useAppState } from '../app-state.js';
import { fromOption, memberOptions, NONE, priorityOptions, projectOptions, statusOptions, typeOptions } from '../overlays/options.js';

/**
 * Every edit you can make to a task, as overlay flows. Shared by the task
 * list and the task detail so both behave identically.
 */
export function useTaskActions() {
  const { services, session, openOverlay, run, notify, cwd, route, go } = useAppState();
  const { tasks } = services;

  const report = (error: unknown) => {
    const display = toDisplayError(error);
    notify(display.message, 'error', display.hint);
  };

  /** A yes/no picker; "No" is the default so Enter never destroys anything by accident. */
  const confirm = (title: string, context: string, yes: string, onYes: () => void) =>
    openOverlay({
      kind: 'picker',
      title,
      context,
      options: [
        { value: 'no', label: 'Cancel' },
        { value: 'yes', label: yes, color: 'yellow' },
      ],
      onSelect: (value) => {
        if (value === 'yes') onYes();
      },
    });

  const update = (task: TaskView, changes: Parameters<typeof tasks.update>[2], success: string) =>
    run(() => tasks.update(session, task, changes), `${task.ref} ${success}`);

  const actions = {
    status(task: TaskView) {
      openOverlay({
        kind: 'picker',
        title: 'Status',
        context: task.ref,
        options: statusOptions,
        initial: task.status,
        onSelect: (value) => update(task, { status: value as TaskStatus }, `moved to ${STATUS_LABELS[value as TaskStatus]}`),
      });
    },
    priority(task: TaskView) {
      openOverlay({
        kind: 'picker',
        title: 'Priority',
        context: task.ref,
        options: priorityOptions,
        initial: task.priority,
        onSelect: (value) => update(task, { priority: value as TaskPriority }, `priority ${PRIORITY_LABELS[value as TaskPriority]}`),
      });
    },
    type(task: TaskView) {
      openOverlay({
        kind: 'picker',
        title: 'Type',
        context: task.ref,
        options: typeOptions,
        initial: task.type,
        onSelect: (value) => update(task, { type: value as TaskType }, `is now a ${TYPE_LABELS[value as TaskType]}`),
      });
    },
    async assign(task: TaskView) {
      const members = await services.workspaces.members(session);
      openOverlay({
        kind: 'picker',
        title: 'Assign',
        context: task.ref,
        options: memberOptions(members, session.user.id),
        initial: task.assigneeId ?? NONE,
        filterable: true,
        onSelect: (value) => {
          const member = members.find((candidate) => candidate.id === value);
          return update(task, { assigneeId: fromOption(value) }, member ? `assigned to @${member.username}` : 'unassigned');
        },
        create: {
          label: (query) => `Add developer @${query.toLowerCase()} and assign`,
          onCreate: (query) =>
            run(async () => {
              const displayName = query.charAt(0).toUpperCase() + query.slice(1);
              const user = await services.workspaces.addMember(session, { username: query, displayName });
              await tasks.update(session, task, { assigneeId: user.id });
            }, `${task.ref} assigned to @${query.toLowerCase()}`),
        },
      });
    },
    async project(task: TaskView) {
      const projects = await services.projects.list(session);
      openOverlay({
        kind: 'picker',
        title: 'Project',
        context: task.ref,
        options: projectOptions(projects),
        initial: task.projectId ?? NONE,
        filterable: true,
        onSelect: (value) => {
          const project = projects.find((candidate) => candidate.id === value);
          return update(task, { projectId: fromOption(value) }, project ? `moved to ${project.name}` : 'has no project');
        },
      });
    },
    async requester(task: TaskView) {
      const suggestions = await tasks.knownRequesters(session);
      openOverlay({
        kind: 'prompt',
        title: 'Requested by',
        context: task.ref,
        initial: task.requester ?? '',
        placeholder: suggestions[0] ?? 'Marketing, Finance, Admissions…',
        suggestions,
        allowEmpty: true,
        onSubmit: (value) => update(task, { requester: value }, value.trim() ? `requested by ${value.trim()}` : 'has no requester'),
      });
    },
    title(task: TaskView) {
      openOverlay({
        kind: 'prompt',
        title: 'Title',
        context: task.ref,
        initial: task.title,
        onSubmit: (value) => update(task, { title: value }, 'renamed'),
      });
    },
    description(task: TaskView) {
      openOverlay({
        kind: 'prompt',
        title: 'Description',
        context: task.ref,
        initial: task.description ?? '',
        placeholder: 'What is going on, where, and how to reproduce it',
        allowEmpty: true,
        onSubmit: (value) => update(task, { description: value }, 'description saved'),
      });
    },
    branchName(task: TaskView) {
      openOverlay({
        kind: 'prompt',
        title: 'Branch',
        context: `${task.ref} · recorded name, Git is not touched`,
        initial: task.branch ?? '',
        placeholder: 'fix/SOJA-12-short-name',
        allowEmpty: true,
        onSubmit: (value) => update(task, { branch: value }, value.trim() ? `branch ${value.trim()}` : 'branch cleared'),
      });
    },
    comment(task: TaskView) {
      openOverlay({
        kind: 'prompt',
        title: 'Comment',
        context: task.ref,
        placeholder: 'Found it. The webhook retries on 500s…',
        onSubmit: (value) => run(() => tasks.comment(session, task, value), `Comment added to ${task.ref}`),
      });
    },
    /** `soja start` from the TUI: shows what will happen in Git, then does it. */
    async branch(task: TaskView) {
      let plan;
      try {
        plan = await services.git.plan(session, task, cwd);
      } catch (error) {
        report(error);
        return;
      }
      const { branch, root } = plan;
      const gitStep = plan.checkedOut
        ? `Stay on ${branch}`
        : plan.branchExists
          ? `Switch to ${branch}`
          : `Create ${branch} from ${plan.currentBranch ?? 'HEAD'}`;
      const label = plan.linkProject ? `Link repository to ${plan.linkProject.name}, ${gitStep.charAt(0).toLowerCase()}${gitStep.slice(1)}` : gitStep;
      const warning =
        plan.uncommitted > 0
          ? plan.branchExists && !plan.checkedOut
            ? `${plan.uncommitted} uncommitted: commit or stash first`
            : `${plan.uncommitted} uncommitted change(s) come along`
          : tildify(root);
      openOverlay({
        kind: 'picker',
        title: 'Start on branch',
        context: `${task.ref} · assign to you · In Progress`,
        options: [
          { value: 'start', label, hint: warning },
          { value: 'cancel', label: 'Cancel', dim: true },
        ],
        onSelect: (value) =>
          value === 'start'
            ? run(() => services.git.start(session, task, { cwd, link: plan.linkProject !== null }), `${task.ref} on ${branch}`)
            : undefined,
      });
    },
    /** Choose files, then a message; commits on the task branch with live output. */
    commit(task: TaskView) {
      openOverlay({ kind: 'commit', task });
    },
    async merge(task: TaskView) {
      let plan;
      try {
        plan = await services.git.mergePlan(session, task, cwd);
      } catch (error) {
        report(error);
        return;
      }
      if (plan.alreadyMerged) {
        notify(`${plan.branch} is already merged into ${plan.into}.`, 'info', 'Delete it from the Git menu (g).');
        return;
      }
      confirm(`Merge into ${plan.into}?`, `${plan.branch} → ${plan.into} · merge commit`, `Merge ${plan.branch} into ${plan.into}`, () =>
        openOverlay({
          kind: 'git-run',
          title: 'Merge',
          context: `${plan.branch} → ${plan.into}`,
          run: async () => {
            const result = await services.git.merge(session, task, { cwd });
            return `Merged into ${result.into} (${result.hash.slice(0, 7)})`;
          },
          next: [
            { key: 'd', label: 'delete branch + mark Done', action: () => actions.deleteBranch(task, { markDone: true }) },
            { key: 'x', label: 'mark Done', action: () => void run(() => tasks.complete(session, task), `${task.ref} done. Nice.`) },
          ],
          recover: {
            merge_conflict: {
              key: 'a',
              label: 'abort merge',
              action: () => actions.abortMerge(task),
            },
          },
        }),
      );
    },
    abortMerge(task: TaskView) {
      openOverlay({
        kind: 'git-run',
        title: 'Abort merge',
        context: task.ref,
        run: async () => {
          await services.git.abortMerge(session, task, cwd);
          return 'Merge aborted. The repository is back to how it was.';
        },
      });
    },
    /** Confirms, then deletes; an unmerged branch needs a second, explicit confirmation. */
    deleteBranch(task: TaskView, options: { markDone?: boolean } = {}) {
      const branch = task.branch;
      if (!branch) {
        notify(`${task.ref} has no branch.`, 'info');
        return;
      }
      const execute = (force: boolean) =>
        openOverlay({
          kind: 'git-run',
          title: force ? 'Delete unmerged branch' : 'Delete branch',
          context: branch,
          run: async () => {
            const result = await services.git.deleteBranch(session, task, { cwd, force });
            if (options.markDone) await tasks.complete(session, task);
            const switched = result.switchedTo ? ` Switched to ${result.switchedTo}.` : '';
            return `Deleted ${result.branch}.${switched}${options.markDone ? ` ${task.ref} is Done.` : ''}`;
          },
          recover: {
            not_merged: {
              key: 'f',
              label: 'delete anyway…',
              action: () =>
                confirm(
                  'Delete an unmerged branch?',
                  `${branch} has commits that are not merged. They will be lost.`,
                  'Yes, delete it and lose those commits',
                  () => execute(true),
                ),
            },
          },
        });
      const doDelete = () => execute(false);
      if (options.markDone) doDelete();
      else confirm('Delete branch?', branch, `Delete ${branch}`, doDelete);
    },
    push(task: TaskView) {
      openOverlay({
        kind: 'git-run',
        title: 'Push',
        context: task.branch ?? task.ref,
        run: async (interactive) => {
          const result = await services.git.push(session, task, { cwd, interactive });
          return `Pushed ${result.branch} to origin`;
        },
      });
    },
    pullRequest(task: TaskView) {
      confirm(
        'Open a pull request?',
        `${task.branch ?? task.ref} → ${task.baseBranch ?? 'base branch'} · pushes first`,
        `Push and open a PR for ${task.ref}`,
        () =>
          openOverlay({
            kind: 'git-run',
            title: 'Pull request',
            context: task.ref,
            run: async (interactive) => {
              const result = await services.git.openPullRequest(session, task, { cwd, interactive });
              return `Pull request ${result.branch} → ${result.base}: ${result.url}`;
            },
          }),
      );
    },
    /** Merges the task's PR on GitHub after showing what is still pending; optionally deletes the branch. */
    async mergePullRequest(task: TaskView) {
      const state = await services.git.pullRequest(session, task, cwd);
      if (state.status !== 'found') {
        notify(state.reason, state.status === 'unavailable' ? 'error' : 'info', state.status === 'unavailable' ? state.hint : 'Open one from the Git menu (g).');
        return;
      }
      const { pr } = state;
      if (pr.state !== 'open') {
        notify(`Pull request #${pr.number} is already ${pr.state}.`, 'info');
        return;
      }
      const warnings = pullRequestWarnings(pr);
      const execute = (deleteBranch: boolean) =>
        openOverlay({
          kind: 'git-run',
          title: `Merge PR #${pr.number}`,
          context: `${pr.head} → ${pr.base}`,
          run: async () => {
            const result = await services.git.mergePullRequest(session, task, { cwd, deleteBranch });
            return `Merged PR #${result.pr.number} into ${result.pr.base} on GitHub. ${task.ref} is Done.${deleteBranch ? ` ${pr.head} deleted.` : ''}`;
          },
        });
      openOverlay({
        kind: 'picker',
        title: `Merge PR #${pr.number} on GitHub?`,
        context: `${pr.head} → ${pr.base} · merge commit${warnings.length ? ` · ${warnings.join(', ')}` : ''}`,
        options: [
          { value: 'no', label: 'Cancel' },
          { value: 'merge', label: `Merge PR #${pr.number}`, color: warnings.length ? 'yellow' : 'green' },
          { value: 'merge-delete', label: `Merge and delete ${pr.head}`, color: 'yellow' },
        ],
        onSelect: (value) => {
          if (value === 'merge') execute(false);
          else if (value === 'merge-delete') execute(true);
        },
      });
    },
    /** Everything Git in one menu. */
    gitMenu(task: TaskView) {
      const items = [
        ['start', 'Start / switch to branch', 'b'],
        ['commit', 'Commit…', 'C'],
        ['push', 'Push branch', ''],
        ['pullRequest', 'Open pull request…', ''],
        ['mergePullRequest', 'Merge pull request on GitHub…', ''],
        ['merge', 'Merge into base…', ''],
        ['abortMerge', 'Abort merge', ''],
        ['deleteBranch', 'Delete branch…', ''],
        ['forget', 'Forget branch (Git untouched)', ''],
        ['log', 'Git log', ''],
      ] as const;
      openOverlay({
        kind: 'picker',
        title: 'Git',
        context: task.branch ? `${task.ref} · ${task.branch}` : `${task.ref} · no branch yet`,
        options: items.map(([value, label, key]) => ({ value, label, hint: key })),
        onSelect: (value) => {
          if (value === 'start') void actions.branch(task);
          else if (value === 'commit') actions.commit(task);
          else if (value === 'push') actions.push(task);
          else if (value === 'pullRequest') actions.pullRequest(task);
          else if (value === 'mergePullRequest') void actions.mergePullRequest(task);
          else if (value === 'merge') void actions.merge(task);
          else if (value === 'abortMerge') actions.abortMerge(task);
          else if (value === 'deleteBranch') actions.deleteBranch(task);
          else if (value === 'forget') void run(() => services.git.forgetBranch(session, task), `${task.ref} has no branch now`);
          else if (value === 'log') openOverlay({ kind: 'git-log' });
        },
      });
    },
    toggleDone(task: TaskView) {
      return isClosed(task.status)
        ? run(() => tasks.reopen(session, task), `${task.ref} reopened`)
        : run(() => tasks.complete(session, task), `${task.ref} done. Nice.`);
    },
    edit(task: TaskView) {
      const fields = [
        ['title', 'Title', 'e'],
        ['description', 'Description', 'd'],
        ['status', 'Status', 's'],
        ['priority', 'Priority', 'p'],
        ['assign', 'Assignee', 'a'],
        ['project', 'Project', 'm'],
        ['type', 'Type', 't'],
        ['requester', 'Requester', 'r'],
        ['branchName', 'Branch name', ''],
      ] as const;
      const archived = task.archivedAt !== null;
      openOverlay({
        kind: 'picker',
        title: 'Edit',
        context: task.ref,
        options: [
          ...fields.map(([value, label, key]) => ({ value, label, hint: key })),
          { value: 'archive', label: archived ? 'Restore from the archive' : 'Archive', hint: archived ? '' : 'hide from lists' },
          { value: 'delete', label: 'Delete permanently…', color: 'red' as const, hint: 'owners' },
        ],
        onSelect: (value) => {
          if (value === 'archive') void actions.toggleArchive(task);
          else if (value === 'delete') actions.remove(task);
          else {
            const field = fields.find(([candidate]) => candidate === value)?.[0];
            if (field) void actions[field](task);
          }
        },
      });
    },
    toggleArchive(task: TaskView) {
      return task.archivedAt
        ? run(() => tasks.restore(session, task), `${task.ref} is back in the lists`)
        : run(() => tasks.archive(session, task), `${task.ref} archived. Find it with / or in Archived tasks.`);
    },
    /** Two confirmations: deleting takes the comments and the timeline with it, for everyone. */
    remove(task: TaskView) {
      confirm('Delete this task for good?', `${task.ref} · ${task.title}`, `Delete ${task.ref}…`, () =>
        confirm(
          'Really delete it?',
          'Its comments and timeline go too, for the whole team. Archive keeps it restorable.',
          `Yes, delete ${task.ref} permanently`,
          () =>
            void run(async () => {
              await tasks.remove(session, task);
              if (route.name === 'task') go({ type: 'pop' });
            }, `${task.ref} deleted`),
        ),
      );
    },
  };
  return actions;
}
