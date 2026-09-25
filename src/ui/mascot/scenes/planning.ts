/* eslint-disable @typescript-eslint/no-non-null-assertion -- scene arrays are indexed within their declared bounds. */
import { blink, drawGround, rng, soilLine, withFace, type Canvas, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const BX = 46;
const VALS = [3, 3, 3, 2, 3, 2, 2, 2, 1, 2, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
const IDEAS = ['( ? )', '( ! )', '(...)', '( % )', '(ok!)'];
const SEATED = [' .-. ', '(o.o)', '(   )'];
const POINT_UP = [' .-.   ', '(o.o) /', '(   )/ ', " ' '   "];
const POINT_SIDE = [' .-.   ', '(o.o)  ', '(   )--', " ' '   "];

export const planning: SceneDef<'planning'> = {
  id: 'planning',
  title: 'Analizando planes',
  useFor: 'Planificación / revisión de sprint',
  width: W,
  height: H,
  create(seed = 4) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    const cycle = () => Math.floor(t / 3) % (VALS.length + 20);
    return {
      step() {
        t++;
      },
      draw(c: Canvas) {
        drawGround(c, G, soil);
        c.put(BX, 0, ' ' + '_'.repeat(30), 'rock');
        for (let y = 1; y < 7; y++) c.put(BX, y, '|' + ' '.repeat(30) + '|', 'rock');
        c.put(BX, 7, '|' + '_'.repeat(30) + '|', 'rock');
        c.put(BX + 4, 8, '/', 'rock');
        c.put(BX + 3, 9, '/', 'rock');
        c.put(BX + 27, 8, '\\', 'rock');
        c.put(BX + 28, 9, '\\', 'rock');
        c.put(BX + 2, 1, 'plan v2', 'text');
        for (let y = 2; y < 6; y++) c.put(BX + 3, y, '|', 'cloud');
        c.put(BX + 3, 6, '+' + '-'.repeat(26), 'cloud');
        const n = cycle();
        const done = n >= VALS.length;
        const shown = Math.min(n, VALS.length);
        for (let i = 0; i < shown; i++) c.put(BX + 5 + i, 2 + VALS[i]!, i === shown - 1 ? '*' : '.', 'accent');
        if (done && t % 10 < 6) c.put(BX + 30, 1, '!', 'good');

        [11, 20, 29].forEach((x, i) => {
          const face = done ? '^.^' : i === 1 ? blink(t, 7, '-.o') : blink(t, 8 + i);
          c.sprite(x, G - 6, withFace(SEATED, face), 'agent');
          if (Math.floor((t + i * 17) / 22) % 3 < 2) {
            c.put(x - 1, G - 8, IDEAS[(Math.floor(t / 66) + i) % 5]!, 'cloud');
            c.put(x + 3, G - 7, 'o', 'cloud');
          }
        });
        c.put(16, G - 4, 'c[]', 'paper');
        c.put(17 + ((t >> 3) % 2), G - 5, '~', 'cloud');
        c.put(25, G - 4, '[=]', 'accent');
        c.put(8, G - 3, '▄'.repeat(31), 'wood');
        for (const lx of [9, 36]) {
          c.put(lx, G - 2, '||', 'wood');
          c.put(lx, G - 1, '||', 'wood');
        }
        const pose = Math.floor(t / 20) % 2 ? POINT_UP : POINT_SIDE;
        c.sprite(39, G - 4, withFace(pose, done ? '^.^' : blink(t, 11)), 'agent');
      },
      status() {
        const n = cycle();
        return n >= VALS.length ? 'plan aprobado' : `analizando · ${Math.round((n / VALS.length) * 100)}%`;
      },
    };
  },
};
