import type { TaskActivity } from '../domain/activity.js';
import type { ProjectRef, TaskComment, UserRef } from '../domain/entities.js';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS, type TaskType } from '../domain/task.js';
import type { TimelineEntry } from './types.js';

export interface TimelineLookups {
  users: ReadonlyMap<string, UserRef>;
  projects: ReadonlyMap<string, ProjectRef>;
}

/** Merges activity and comments into one chronological timeline. */
export function buildTimeline(
  activity: readonly TaskActivity[],
  comments: readonly TaskComment[],
  lookups: TimelineLookups,
): TimelineEntry[] {
  const user = (id: string | null) => (id ? (lookups.users.get(id) ?? null) : null);
  const entries: TimelineEntry[] = [];

  for (const item of activity) {
    // The comment itself is a richer entry than "added a comment".
    if (item.type === 'comment_added') continue;
    entries.push({ kind: 'event', id: item.id, at: item.createdAt, actor: user(item.userId), text: describe(item, lookups) });
  }
  for (const comment of comments) {
    entries.push({ kind: 'comment', id: comment.id, at: comment.createdAt, actor: user(comment.userId), body: comment.body });
  }
  // Stable sort keeps insertion order for entries written in the same millisecond.
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function describe(item: TaskActivity, lookups: TimelineLookups): string {
  const who = (id: string | null) => (id ? `@${lookups.users.get(id)?.username ?? 'someone'}` : 'nobody');
  const project = (id: string | null) => (id ? (lookups.projects.get(id)?.name ?? 'a removed project') : null);

  switch (item.type) {
    case 'task_created':
      return 'created the task';
    case 'status_changed':
      return `moved ${STATUS_LABELS[item.metadata.from]} → ${STATUS_LABELS[item.metadata.to]}`;
    case 'task_completed':
      return `completed it · ${STATUS_LABELS[item.metadata.from]} → Done`;
    case 'task_reopened':
      return `reopened it · ${STATUS_LABELS[item.metadata.from]} → ${STATUS_LABELS[item.metadata.to]}`;
    case 'priority_changed':
      return `set priority ${PRIORITY_LABELS[item.metadata.from]} → ${PRIORITY_LABELS[item.metadata.to]}`;
    case 'assigned':
      return item.metadata.from ? `reassigned ${who(item.metadata.from)} → ${who(item.metadata.to)}` : `assigned ${who(item.metadata.to)}`;
    case 'unassigned':
      return `unassigned ${who(item.metadata.from)}`;
    case 'project_changed': {
      const to = project(item.metadata.to);
      return to ? `moved it to ${to}` : 'removed it from its project';
    }
    case 'comment_added':
      return 'added a comment';
    case 'task_updated': {
      const { field, from, to } = item.metadata;
      switch (field) {
        case 'title':
          return `renamed it to “${to ?? ''}”`;
        case 'description':
          return to ? 'edited the description' : 'cleared the description';
        case 'type':
          return `changed type ${typeLabel(from)} → ${typeLabel(to)}`;
        case 'requester':
          return to ? `set requester to ${to}` : 'cleared the requester';
        case 'branch':
          return to ? `linked branch ${to}` : 'unlinked the branch';
      }
    }
  }
}

function typeLabel(value: string | null): string {
  return value && value in TYPE_LABELS ? TYPE_LABELS[value as TaskType] : (value ?? '—');
}
