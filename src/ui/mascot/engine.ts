/* eslint-disable @typescript-eslint/no-non-null-assertion -- canvas operations validate coordinates before writing. */
/**
 * Motor de escenas ASCII, sin dependencias.
 * Una escena dibuja en un Canvas de celdas (carácter + tono) y el renderer
 * (Ink, ANSI o navegador) traduce cada tono a un color.
 */

export type Tone =
  | 'agent'
  | 'rock'
  | 'soil'
  | 'dirt'
  | 'spark'
  | 'fire'
  | 'flame'
  | 'water'
  | 'good'
  | 'bad'
  | 'accent'
  | 'cloud'
  | 'wood'
  | 'paper'
  | 'leaf'
  | 'text';

export interface Segment {
  text: string;
  tone: Tone | null;
}

export class Canvas {
  readonly chars: string[];
  readonly tones: (Tone | null)[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.chars = new Array(width * height).fill(' ');
    this.tones = new Array(width * height).fill(null);
  }

  /** Escribe un texto; los espacios son transparentes. */
  put(x: number, y: number, text: string, tone: Tone | null = null): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (ry < 0 || ry >= this.height) return;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      const cx = rx + i;
      if (ch === ' ' || cx < 0 || cx >= this.width) continue;
      this.chars[ry * this.width + cx] = ch;
      this.tones[ry * this.width + cx] = tone;
    }
  }

  /** Escribe un solo carácter, aunque sea un espacio (sirve para borrar). */
  set(x: number, y: number, ch: string, tone: Tone | null = null): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx < 0 || rx >= this.width || ry < 0 || ry >= this.height) return;
    this.chars[ry * this.width + rx] = ch;
    this.tones[ry * this.width + rx] = tone;
  }

  /** Dibuja un sprite de varias líneas con la parte superior en `top`. */
  sprite(x: number, top: number, lines: readonly string[], tone: Tone | null): void {
    lines.forEach((line, i) => this.put(x, top + i, line, tone));
  }

  /** Filas agrupadas en segmentos del mismo tono, listas para renderizar. */
  rows(): Segment[][] {
    const out: Segment[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: Segment[] = [];
      let tone: Tone | null | undefined;
      let buf = '';
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const t = this.chars[i] === ' ' ? null : this.tones[i]!;
        if (t !== tone && buf) {
          row.push({ text: buf, tone: tone ?? null });
          buf = '';
        }
        tone = t;
        buf += this.chars[i];
      }
      if (buf) row.push({ text: buf, tone: tone ?? null });
      out.push(row);
    }
    return out;
  }

  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      lines.push(this.chars.slice(y * this.width, (y + 1) * this.width).join(''));
    }
    return lines.join('\n');
  }
}

export interface SceneRuntime {
  /** Avanza un fotograma. */
  step(): void;
  /** Dibuja el fotograma actual. */
  draw(canvas: Canvas): void;
  /** Línea de estado corta (en español). */
  status(): string;
}

export interface SceneDef<Id extends string = string> {
  id: Id;
  /** Nombre corto para mostrar. */
  title: string;
  /** Situación del task manager para la que está pensada. */
  useFor: string;
  width: number;
  height: number;
  create(seed?: number): SceneRuntime;
}

/* ---------- utilidades compartidas ---------- */

/** PRNG determinista (mulberry32) para que cada escena sea reproducible. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIRROR: Record<string, string> = {
  '/': '\\',
  '\\': '/',
  '[': ']',
  ']': '[',
  '(': ')',
  ')': '(',
  '<': '>',
  '>': '<',
};

/** Voltea un sprite horizontalmente. */
export function mirror(lines: readonly string[]): string[] {
  const w = Math.max(...lines.map((l) => l.length));
  return lines.map((l) =>
    l
      .padEnd(w)
      .split('')
      .reverse()
      .map((c) => MIRROR[c] ?? c)
      .join(''),
  );
}

/** Sustituye la cara `o.o` del sprite. */
export function withFace(lines: readonly string[], face: string): string[] {
  return lines.map((l) => l.replace('o.o', face));
}

/** Cara con parpadeo ocasional, desfasado por agente. */
export function blink(t: number, i: number, face = 'o.o'): string {
  return (t + i * 37) % 70 < 2 ? '-.-' : face;
}

export function soilLine(width: number, r: () => number): string {
  let s = '';
  for (let i = 0; i < width; i++) {
    const q = r();
    s += q < 0.08 ? '.' : q < 0.12 ? ':' : q < 0.15 ? "'" : ' ';
  }
  return s;
}

export function drawGround(c: Canvas, groundY: number, soil: string[]): void {
  for (let x = 0; x < c.width; x++) c.set(x, groundY, '▀', 'soil');
  soil.forEach((line, i) => c.put(0, groundY + 1 + i, line, 'soil'));
}

export function drawCloud(c: Canvas, t: number, speed: number, offset: number, y: number, big = true): void {
  const x = ((t * speed + offset) % (c.width + 14)) - 12;
  if (big) {
    c.put(x, y, '  .--.', 'cloud');
    c.put(x, y + 1, '.(    ).', 'cloud');
  } else {
    c.put(x, y, ' .-. ', 'cloud');
    c.put(x, y + 1, '(   )', 'cloud');
  }
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  tone: Tone;
  life?: number;
}

/** Sprites base del agente (5 de ancho, cara `o.o`). */
export const AGENT = {
  stand: [' .-. ', '(o.o)', '(   )', " ' ' "],
  walk: [' .-. ', '(o.o)', '(   )', "  ' '"],
  sit: [' .-. ', '(o.o)', '(___)'],
} as const;
