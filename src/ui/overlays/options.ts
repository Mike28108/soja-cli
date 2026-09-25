import type { Member } from '../../application/types.js';
import type { Project } from '../../domain/entities.js';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TYPE_LABELS } from '../../domain/task.js';
import { priorityStyles, priorityTone, statusStyles, statusTone } from '../theme/theme.js';
import type { PickerOption } from './types.js';

export const NONE = '__none__';

export const statusOptions: PickerOption[] = TASK_STATUSES.map((status) => {
  const style = statusStyles[status];
  return { value: status, label: `${style.glyph} ${style.label}`, tone: statusTone[status], dim: status === 'cancelled' };
});

export const priorityOptions: PickerOption[] = [...TASK_PRIORITIES].reverse().map((priority) => {
  const style = priorityStyles[priority];
  return { value: priority, label: priority === 'none' ? 'NONE' : style.label, tone: priorityTone[priority], dim: priority === 'none' };
});

export const typeOptions: PickerOption[] = TASK_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

export function memberOptions(members: readonly Member[], meId: string): PickerOption[] {
  return [
    ...members.map((member) => ({
      value: member.id,
      label: `@${member.username}`,
      hint: member.id === meId ? `${member.displayName} (you)` : member.displayName,
    })),
    { value: NONE, label: 'Unassigned', dim: true },
  ];
}

export function projectOptions(projects: readonly Project[]): PickerOption[] {
  return [
    ...projects.map((project) => ({ value: project.id, label: project.name, hint: project.key })),
    { value: NONE, label: 'No project', dim: true },
  ];
}

export const fromOption = (value: string): string | null => (value === NONE ? null : value);
