import type { SceneId } from './scenes/index.js';

/**
 * Sugerencia de qué escena mostrar para cada estado de un task manager.
 * Ajusta las claves a los estados reales de tu app.
 */
export const TASK_STATE_SCENES = {
  inProgress: 'working',
  idle: 'resting',
  paused: 'resting',
  booting: 'clockIn',
  planning: 'planning',
  urgent: 'fire',
  incident: 'fire',
  completed: 'celebrate',
  syncing: 'syncing',
  loading: 'syncing',
  error: 'bugHunt',
  blocked: 'bugHunt',
  empty: 'empty',
  overdue: 'deadline',
  dueSoon: 'deadline',
  archiving: 'cleaning',
} as const satisfies Record<string, SceneId>;

export type TaskState = keyof typeof TASK_STATE_SCENES;

export function sceneForState(state: TaskState): SceneId {
  return TASK_STATE_SCENES[state];
}
