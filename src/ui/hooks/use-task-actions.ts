import type { TaskView } from '../../application/types.js';
import {
  isClosed,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '../../domain/task.js';
import { useAppState } from '../app-state.js';
import { fromOption, memberOptions, NONE, priorityOptions, projectOptions, statusOptions, typeOptions } from '../overlays/options.js';

/**
 * Every edit you can make to a task, as overlay flows. Shared by the task
 * list and the task detail so both behave identically.
 */
export function useTaskActions() {
  const { services, session, openOverlay, run } = useAppState();
  const { tasks } = services;

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
    comment(task: TaskView) {
      openOverlay({
        kind: 'prompt',
        title: 'Comment',
        context: task.ref,
        placeholder: 'Found it. The webhook retries on 500s…',
        onSubmit: (value) => run(() => tasks.comment(session, task, value), `Comment added to ${task.ref}`),
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
      ] as const;
      openOverlay({
        kind: 'picker',
        title: 'Edit',
        context: task.ref,
        options: fields.map(([value, label, key]) => ({ value, label, hint: key })),
        onSelect: (value) => {
          const field = fields.find(([candidate]) => candidate === value)?.[0];
          if (field) void actions[field](task);
        },
      });
    },
  };
  return actions;
}
