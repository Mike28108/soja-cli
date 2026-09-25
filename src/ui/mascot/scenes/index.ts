import { working } from './working.js';
import { resting } from './resting.js';
import { clockIn } from './clockIn.js';
import { planning } from './planning.js';
import { fire } from './fire.js';
import { celebrate } from './celebrate.js';
import { syncing } from './syncing.js';
import { bugHunt } from './bugHunt.js';
import { empty } from './empty.js';
import { deadline } from './deadline.js';
import { cleaning } from './cleaning.js';

export const SCENES = {
  working,
  resting,
  clockIn,
  planning,
  fire,
  celebrate,
  syncing,
  bugHunt,
  empty,
  deadline,
  cleaning,
} as const;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
