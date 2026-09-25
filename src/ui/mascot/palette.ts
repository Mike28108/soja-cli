import type { Tone } from './engine.js';

/** Colores por tono. Acepta cualquier color que entienda `<Text color>` de Ink (hex o nombre). */
export type Palette = Record<Tone, string>;

export const defaultPalette: Palette = {
  agent: '#D85A30',
  rock: '#9A9893',
  soil: '#6B6A66',
  dirt: '#C8913A',
  spark: '#F2C14E',
  fire: '#E24B4A',
  flame: '#F2A93B',
  water: '#4FA3E0',
  good: '#63B34A',
  bad: '#E24B4A',
  accent: '#5AA9E6',
  cloud: '#7D7C77',
  wood: '#A9743F',
  paper: '#E8E6DF',
  leaf: '#5FAE54',
  text: '#CFCDC6',
};
