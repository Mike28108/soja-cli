/* eslint-disable @typescript-eslint/no-non-null-assertion, prefer-const -- scene arrays are indexed within bounds; particle arrays are mutated in place. */
import { AGENT, blink, drawCloud, drawGround, rng, soilLine, withFace, type Canvas, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const FRONT = 57;
const GAP = 7;
const CLOCK = 64;
const PUNCH = [' .-.   ', '(o.o)  ', '(   )=]', " ' '   "];
const TAP = [' .-. ', '(o.o)', '(   )', " '  ."];
const TALK = ['(zzz)', '(ya?)', '(café..)', '(...)', '(lunes)'];

interface Walker {
  x: number;
  k: number;
  id: number;
  moving?: boolean;
}

export const clockIn: SceneDef<'clockIn'> = {
  id: 'clockIn',
  title: 'Ponchando entrada',
  useFor: 'Inicio del día / cargando la app',
  width: W,
  height: H,
  create(seed = 3) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let q: Walker[] = [];
    let gone: Walker[] = [];
    let nid = 6;
    let punched = 0;
    let flash = 0;
    let mins = 7 * 60 + 52;
    for (let i = 0; i < 5; i++) q.push({ x: FRONT - GAP * i, k: 0, id: i + 1 });

    return {
      step() {
        t++;
        if (t % 25 === 0) {
          mins++;
          if (mins > 8 * 60 + 10) mins = 7 * 60 + 52;
        }
        q.forEach((a, i) => {
          const tx = FRONT - GAP * i;
          a.moving = a.x < tx;
          if (a.moving) a.x = Math.min(tx, a.x + 0.5);
        });
        const f = q[0];
        if (f && f.x === FRONT) {
          f.k++;
          if (f.k === 9) {
            punched++;
            flash = 10;
          }
          if (f.k > 16) {
            gone.push(q.shift()!);
            q.push({ x: -6, k: 0, id: nid++ });
          }
        }
        for (const a of gone) a.x += 0.5;
        gone = gone.filter((a) => a.x < W);
        if (flash) flash--;
      },
      draw(c: Canvas) {
        drawCloud(c, t, 0.05, 50, 0);
        drawGround(c, G, soil);
        c.put(28, 1, ' ______________ ', 'wood');
        c.put(28, 2, '| entrada 8:00 |', 'wood');
        c.put(28, 3, "'--------------'", 'wood');
        c.put(28, 2, '|', 'wood');
        c.put(30, 2, 'entrada 8:00', 'text');
        c.put(74, G - 6, '____', 'wood');
        for (let y = G - 5; y < G; y++) c.put(74, y, '|  |', 'wood');
        c.put(76, G - 3, 'o', 'spark');

        const talker = Math.floor(t / 20) % 5;
        q.forEach((a, i) => {
          const w = Math.floor(t / 2) % 2;
          let sp: readonly string[] = a.moving ? (w ? AGENT.stand : AGENT.walk) : AGENT.stand;
          if (i === 0 && a.k >= 4 && a.k <= 14) sp = PUNCH;
          if (!a.moving && a.id % 3 === 2 && i > 0) sp = Math.floor(t / 3) % 2 ? AGENT.stand : TAP;
          const face = i === 0 && a.k > 9 ? '^.^' : a.id % 3 === 0 ? blink(t, a.id, '-.o') : blink(t, a.id);
          c.sprite(a.x, G - 4, withFace(sp, face), 'agent');
          if (i === talker && i > 0 && !a.moving) c.put(a.x - 1, G - 5, TALK[a.id % 5]!, 'cloud');
        });
        for (const a of gone) c.sprite(a.x, G - 4, withFace(Math.floor(t / 2) % 2 ? AGENT.stand : AGENT.walk, '^.^'), 'agent');

        c.put(CLOCK, G - 5, ' ______ ', 'rock');
        c.put(CLOCK, G - 4, '|      |', 'rock');
        c.put(CLOCK, G - 3, '|      |', 'rock');
        c.put(CLOCK, G - 2, '|[____]|', 'rock');
        c.put(CLOCK, G - 1, "'------'", 'rock');
        const hh = String(Math.floor(mins / 60)).padStart(2, '0');
        const mm = String(mins % 60).padStart(2, '0');
        c.put(CLOCK + 1, G - 4, hh + (t % 10 < 5 ? ':' : ' ') + mm, 'accent');
        if (flash) c.put(CLOCK + 3, G - 3, 'ok', 'good');
      },
      status() {
        return `ponchados ${punched} · en fila ${q.length}`;
      },
    };
  },
};
