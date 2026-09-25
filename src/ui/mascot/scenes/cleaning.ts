/* eslint-disable prefer-const -- particle arrays are mutated in place by the scene engine. */
import { AGENT, blink, drawGround, mirror, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const CABINET = [' .------. ', ' |[ -- ]| ', ' |[ -- ]| ', ' |[ -- ]| ', " '------' "];
const BIN = ['._____.', '|     |', '|     |', "'-----'"];
const SWEEP_A = [' .-.   ', '(o.o)  ', '(   )\\ ', " ' '  #"];
const SWEEP_B = [' .-.   ', '(o.o)  ', '(   )| ', " ' '  #"];
const BROOM_UP = mirror([' .-. #', '(o.o)|', '(   )|', " ' '  "]);
const CARRY = [' .-.  ', '(o.o) ', '(   )=', " ' '  "];
const CARRY_B = [' .-.  ', '(o.o) ', '(   )=', "  ' ' "];
const SWEEP_L = 22;
const BIN_X = 70;
const BOX_X = 16;
const BOX_MAX = 6;

export const cleaning: SceneDef<'cleaning'> = {
  id: 'cleaning',
  title: 'Limpiando',
  useFor: 'Archivar / limpiar tareas completadas',
  width: W,
  height: H,
  create(seed = 11) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let dust = new Set<number>();
    const sprinkle = (n: number) => {
      for (let i = 0; i < n; i++) dust.add(SWEEP_L + 6 + Math.floor(r() * (BIN_X - SWEEP_L - 8)));
    };
    sprinkle(18);
    const sweepers = [
      { x: SWEEP_L, dir: 1, load: 0, n: 1 },
      { x: SWEEP_L + 20, dir: 1, load: 0, n: 2 },
    ];
    let bin = 0;
    let archived = 0;
    let boxes = BOX_MAX;
    const arch = { x: BOX_X - 5, st: 'pick' as 'pick' | 'go' | 'drop' | 'back', k: 0 };
    let puffs: Particle[] = [];

    return {
      step() {
        t++;
        for (const s of sweepers) {
          if (s.dir > 0) {
            s.x += 0.3;
            const head = Math.round(s.x + 6);
            for (const d of [head, head + 1]) {
              if (dust.has(d)) {
                dust.delete(d);
                s.load++;
                puffs.push({ x: d, y: G - 2, vx: (r() - 0.3) * 0.4, vy: -0.3 - r() * 0.2, ch: r() < 0.5 ? '.' : "'", tone: 'soil', life: 0 });
              }
            }
            if (t % 5 === s.n) puffs.push({ x: s.x + 6, y: G - 1, vx: r() * 0.4, vy: -0.25, ch: '.', tone: 'cloud', life: 0 });
            if (s.x + 7 >= BIN_X) {
              bin = Math.min(100, bin + s.load * 4);
              s.load = 0;
              s.dir = -1;
            }
          } else {
            s.x -= 0.45;
            if (s.x <= SWEEP_L) {
              s.dir = 1;
              sprinkle(5);
            }
          }
        }
        if (bin >= 100 && t % 40 === 0) bin = 0;
        arch.k++;
        if (arch.st === 'pick' && arch.k > 5) {
          if (boxes > 0) {
            boxes--;
            arch.st = 'go';
          }
          arch.k = 0;
        } else if (arch.st === 'go') {
          arch.x -= 0.4;
          if (arch.x <= 9) {
            arch.st = 'drop';
            arch.k = 0;
          }
        } else if (arch.st === 'drop' && arch.k > 5) {
          archived++;
          arch.st = 'back';
          arch.k = 0;
        } else if (arch.st === 'back') {
          arch.x += 0.4;
          if (arch.x >= BOX_X - 5) {
            arch.st = 'pick';
            arch.k = 0;
            if (boxes === 0) boxes = BOX_MAX;
          }
        }
        for (const p of puffs) {
          p.x += p.vx;
          p.y += p.vy;
          p.life = (p.life ?? 0) + 1;
        }
        puffs = puffs.filter((p) => (p.life ?? 0) < 7);
      },
      draw(c: Canvas) {
        drawGround(c, G, soil);
        c.sprite(0, G - 5, CABINET, 'rock');
        const drawer = arch.st === 'drop' ? 1 : -1;
        if (drawer > 0) c.put(2, G - 3, '[====]', 'paper');
        for (let i = 0; i < boxes; i++) c.put(BOX_X + (i % 2) * 3, G - 1 - Math.floor(i / 2), '[▤]', 'paper');
        c.sprite(BIN_X, G - 4, BIN, 'rock');
        const fill = Math.round((bin / 100) * 2);
        for (let i = 0; i < fill; i++) c.put(BIN_X + 1, G - 2 - i, ':.:.:', 'soil');
        if (bin >= 100 && t % 8 < 5) c.put(BIN_X - 1, G - 6, '(lleno)', 'cloud');

        for (const d of dust) c.put(d, G - 1, t % 20 < 10 ? '.' : ',', 'soil');

        sweepers.forEach((s, i) => {
          if (s.dir > 0) {
            const sp = Math.floor(t / 3) % 2 ? SWEEP_A : SWEEP_B;
            c.sprite(s.x, G - 4, withFace(sp, blink(t, i)), 'agent');
            if (s.load > 0) c.put(s.x + 7, G - 1, s.load > 4 ? '::' : ':', 'soil');
          } else {
            c.sprite(s.x, G - 4, withFace(BROOM_UP, Math.floor(t / 2) % 2 ? '^.^' : blink(t, i, '^.^')), 'agent');
          }
        });

        const w = Math.floor(t / 2) % 2;
        if (arch.st === 'go') {
          c.sprite(arch.x, G - 4, withFace(mirror(w ? CARRY : CARRY_B), blink(t, 5)), 'agent');
          c.put(arch.x - 3, G - 2, '[▤]', 'paper');
        } else if (arch.st === 'drop') {
          c.sprite(arch.x, G - 4, withFace(mirror(CARRY), '^.^'), 'agent');
        } else {
          c.sprite(arch.x, G - 4, withFace(arch.st === 'back' && w ? AGENT.walk : AGENT.stand, blink(t, 5)), 'agent');
        }
        for (const p of puffs) c.put(p.x, p.y, p.ch, p.tone);
      },
      status() {
        return `archivadas ${archived} · basura ${bin}%`;
      },
    };
  },
};
