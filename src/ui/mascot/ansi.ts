/* eslint-disable @typescript-eslint/no-non-null-assertion -- ANSI frame encoding indexes rows created from canvas dimensions. */
import { Canvas, type SceneRuntime, type SceneDef } from './engine.js';
import { defaultPalette, type Palette } from './palette.js';

function hexToAnsi(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '';
  const n = parseInt(m[1]!, 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

/** Renderiza un fotograma como texto ANSI (útil fuera de Ink: logs, CLI simple, tests). */
export function frameToAnsi(def: SceneDef, runtime: SceneRuntime, palette: Palette = defaultPalette): string {
  const c = new Canvas(def.width, def.height);
  runtime.draw(c);
  return c
    .rows()
    .map((row) => row.map((s) => (s.tone ? hexToAnsi(palette[s.tone]) + s.text + '\x1b[0m' : s.text)).join(''))
    .join('\n');
}

/** Renderiza un fotograma como texto plano. */
export function frameToText(def: SceneDef, runtime: SceneRuntime): string {
  const c = new Canvas(def.width, def.height);
  runtime.draw(c);
  return c.toString();
}
