/* eslint-disable @typescript-eslint/no-non-null-assertion -- scene arrays are indexed within their declared bounds. */
import {
  blink,
  drawCloud,
  drawGround,
  mirror,
  rng,
  soilLine,
  withFace,
  type Canvas,
  type Particle,
  type SceneDef,
} from '../engine.js';

const W = 78;
const H = 15;
const G = 10;

const PICK_UP = [' .-.  _.', '(o.o)/  ', '(   )   ', " ' '    "];
const PICK_DOWN = [' .-.    ', '(o.o)   ', '(   )\\_ ', " ' '  ' "];
const SHOVEL_DIG = [' .-.     ', '(o.o)    ', '(   )\\   ', " ' ' \\_  "];
const SHOVEL_LIFT = [' .-. _.:_', '(o.o)/   ', '(   )    ', " ' '     "];
const CARRY_A = [' .-.  ', '(o.o) ', '(   )=', " ' '  "];
const CARRY_B = [' .-.  ', '(o.o) ', '(   )=', "  ' ' "];
const PLACE = [' .-.    ', '(o.o)__ ', '(   )   ', " ' '    "];
const BACK_A = mirror([' .-. ', '(o.o)', '(   )', " ' ' "]);
const BACK_B = mirror([' .-. ', '(o.o)', '(   )', "  ' '"]);
const CROUCH = mirror(['      ', ' .-.  ', '(o.o)\\', " ' '  "]);
const ROCK = ['  ▄▓▄  ', ' ▓▓▒▓▓ ', '▓▒▓▓▓▒▓', '▓▓▓▒▓▓▓'];
const BLOCKS = ['▓▒▓', '▓▓▒', '▒▓▓'];
const PILE: string[][] = [
  [],
  ['  .  '],
  [' .:. '],
  ['.:::.', '  .  '],
  [':::::', '.:::.', ' .:. '],
  [':::::::', ':::::', '.:::.', ' .:. '],
];
const WALL_X = 68;
const WALL_COLS = 3;
const WALL_MAX = 15;

type CarrierState = 'pick' | 'go' | 'place' | 'back';

export const working: SceneDef<'working'> = {
  id: 'working',
  title: 'Trabajando',
  useFor: 'Tareas en progreso',
  width: W,
  height: H,
  create(seed = 1) {
    const r = rng(seed);
    const soil = Array.from({ length: H - G - 1 }, () => soilLine(W, r));
    const miners = [
      { x: 1, off: 0, m: false, sx: 8, n: 1 },
      { x: 14, off: 5, m: true, sx: 14, n: 2 },
    ];
    const shovelers = [
      { x: 24, off: 0, m: false, hole: 29, px: 31, vx: 0.55, n: 3 },
      { x: 37, off: 6, m: true, hole: 38, px: 39, vx: -0.55, n: 4 },
    ];
    const carriers: { x: number; st: CarrierState; k: number; n: number; happy: number }[] = [
      { x: 52, st: 'pick', k: 0, n: 5, happy: -99 },
      { x: 59, st: 'back', k: 0, n: 6, happy: -99 },
    ];
    let t = 0;
    let placed = 0;
    let dirt = 0;
    let hits = 0;
    let hold = 0;
    let msg = '';
    let parts: Particle[] = [];
    let sparks: { x: number; y: number; l: number }[] = [];

    return {
      step() {
        t++;
        for (const a of miners) {
          if ((t + a.off) % 10 === 6) {
            hits++;
            sparks.push({ x: a.sx, y: G - 2, l: 2 });
            for (let i = 0; i < 2; i++) {
              parts.push({
                x: a.sx,
                y: G - 3,
                vx: (a.m ? 1 : -1) * (0.3 + r() * 0.5),
                vy: -0.5 - r() * 0.3,
                ch: ".'`"[i % 3]!,
                tone: 'rock',
              });
            }
            msg = `agente-0${a.n}: picando roca`;
          }
        }
        for (const a of shovelers) {
          const p = (t + a.off) % 12;
          if (p === 6 || p === 7) {
            parts.push({ x: a.px, y: G - 4, vx: a.vx + (r() - 0.5) * 0.1, vy: -0.5, ch: p === 6 ? ':' : '.', tone: 'dirt' });
            if (p === 6) {
              dirt++;
              msg = `agente-0${a.n}: sacando tierra`;
            }
          }
        }
        for (const a of carriers) {
          a.k++;
          if (a.st === 'pick' && a.k > 4) {
            a.st = 'go';
            a.k = 0;
          } else if (a.st === 'go') {
            a.x += 0.5;
            if (a.x >= 59) {
              a.st = 'place';
              a.k = 0;
            }
          } else if (a.st === 'place' && a.k === 2) {
            if (placed < WALL_MAX && !hold) {
              placed++;
              a.happy = t;
              msg = `agente-0${a.n}: bloque ${placed} colocado`;
            }
          } else if (a.st === 'place' && a.k > 4) {
            a.st = 'back';
            a.k = 0;
          } else if (a.st === 'back') {
            a.x -= 0.5;
            if (a.x <= 52) {
              a.st = 'pick';
              a.k = 0;
            }
          }
        }
        if (placed >= WALL_MAX && !hold) {
          hold = 30;
          msg = 'muro completo';
        }
        if (hold) {
          hold--;
          if (!hold) {
            placed = 0;
            dirt = 0;
          }
        }
        for (const p of parts) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.12;
        }
        parts = parts.filter((p) => p.y < G - 0.5 && p.x >= 0 && p.x < W);
        for (const s of sparks) s.l--;
        sparks = sparks.filter((s) => s.l > 0);
      },

      draw(c: Canvas) {
        drawCloud(c, t, 0.06, 0, 1);
        drawCloud(c, t, 0.04, 40, 3, false);
        drawGround(c, G, soil);
        for (const a of shovelers) {
          for (let i = a.hole; i < a.hole + 3; i++) {
            c.set(i, G, ' ');
            c.set(i, G + 1, '▀', 'soil');
          }
        }
        c.sprite(8, G - 4, ROCK, 'rock');
        const pile = PILE[Math.min(5, Math.floor(dirt / 4))]!;
        pile.forEach((l, i) => c.put(34 - Math.floor(l.length / 2), G - 1 - i, l, 'dirt'));
        c.put(46, G - 1, '▓▒▓▓▓▒', 'rock');
        c.put(47, G - 2, '▓▓▒', 'rock');
        for (let i = 0; i < placed; i++) {
          c.put(WALL_X + 3 * (i % WALL_COLS), G - 1 - Math.floor(i / WALL_COLS), BLOCKS[i % 3]!, 'rock');
        }
        if (hold) {
          c.put(WALL_X + 4, G - 7, '|', 'good');
          c.put(WALL_X + 4, G - 8, '|>', 'good');
        }
        miners.forEach((a, i) => {
          let sp = (t + a.off) % 10 < 6 ? PICK_UP : PICK_DOWN;
          if (a.m) sp = mirror(sp);
          c.sprite(a.x, G - 4, withFace(sp, blink(t, i)), 'agent');
        });
        shovelers.forEach((a, i) => {
          let sp = (t + a.off) % 12 < 6 ? SHOVEL_DIG : SHOVEL_LIFT;
          if (a.m) sp = mirror(sp);
          c.sprite(a.x, G - 4, withFace(sp, blink(t, i + 2)), 'agent');
        });
        carriers.forEach((a, i) => {
          const face = t - a.happy < 8 ? '^.^' : blink(t, i + 4);
          const w = Math.floor(t / 2) % 2;
          const sp =
            a.st === 'pick' ? CROUCH : a.st === 'go' ? (w ? CARRY_A : CARRY_B) : a.st === 'place' ? PLACE : w ? BACK_A : BACK_B;
          c.sprite(a.x, G - 4, withFace(sp, face), 'agent');
          if (a.st === 'go') c.put(a.x + 6, G - 2, '▓▒▓', 'rock');
        });
        for (const p of parts) c.put(p.x, p.y, p.ch, p.tone);
        for (const s of sparks) c.put(s.x, s.y, '*', 'spark');
      },

      status() {
        return `bloques ${placed}/${WALL_MAX} · golpes ${hits} · paladas ${dirt}${msg ? ' · ' + msg : ''}`;
      },
    };
  },
};
