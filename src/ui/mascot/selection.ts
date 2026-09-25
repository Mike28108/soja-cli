import type { TaskView } from '../../application/types.js';
import type { TaskFilter } from '../../application/filters.js';
import type { SceneId } from './scenes/index.js';

export function sceneForTask(task: TaskView): SceneId {
  if (task.status === 'done') return 'celebrate';
  if (task.status === 'blocked') return 'bugHunt';
  if (task.priority === 'urgent') return 'fire';
  switch (task.status) {
    case 'in_progress': return 'working';
    case 'review': return 'planning';
    case 'cancelled': return 'cleaning';
    case 'backlog':
    case 'todo': return 'resting';
  }
}

export function sceneForTaskList(tasks: readonly TaskView[], filter: TaskFilter, syncing: boolean): SceneId {
  if (syncing) return 'syncing';
  if (tasks.length === 0) return 'empty';
  if (tasks.some((task) => task.priority === 'urgent')) return 'fire';
  if (tasks.some((task) => task.status === 'blocked')) return 'bugHunt';
  if (filter === 'archived' || filter === 'done') return 'cleaning';
  if (tasks.some((task) => task.status === 'in_progress')) return 'working';
  if (tasks.some((task) => task.status === 'review')) return 'planning';
  return 'resting';
}
