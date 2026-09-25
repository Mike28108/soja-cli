/* eslint-disable @typescript-eslint/no-non-null-assertion -- scene arrays are indexed within their declared bounds. */
import { blink, drawCloud, drawGround, mirror, rng, soilLine, withFace, type Canvas, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const LAPTOP = [' .-------. ', ' |       | ', ' |_______| ', '/_________\\'];
const SERVER = [' .------. ', ' |[    ]| ', ' |[    ]| ', ' |[    ]| ', " '------' "];
const LOAD_REACH = mirror([' .-.  ', '(o.o) ', '(   )_', " ' '  "]);
const LOAD_PUT = [' .-.  ', '(o.o) ', '(   )_', " ' '  "];
const BELT_L = 18;
const BELT_R = 60;
const WIRE_Y = 2;

export const syncing: SceneDef<'syncing'> = {
  id: 'syncing',
  title: 'Sincronizando',
  useFor: 'Cargando / sincronizando datos',
  width: W,
  height: H,
  create(seed = 7) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let progress = 0;
    let doneT = 0;
    let up: { x: number }[] = [];
    let down: { x: number }[] = [];
    let loadT = 0;
    let unloadT = 0;

    return {
      step() {
        t++;
        if (doneT) {
          doneT--;
          if (!doneT) progress = 0;
          return;
        }
        if (t % 14 === 0) {
          up.push({ x: BELT_L });
          loadT = 6;
        }
        if (t % 22 === 11) down.push({ x: 66 });
        for (const p of up) p.x += 0.5;
        for (const p of down) p.x -= 0.6;
        if (up.length && up[0]!.x >= BELT_R - 1) {
          up.shift();
          unloadT = 6;
          progress = Math.min(100, progress + 7);
        }
        if (down.length && down[0]!.x <= 10) {
          down.shift();
          progress = Math.min(100, progress + 3);
        }
        if (loadT) loadT--;
        if (unloadT) unloadT--;
        if (progress >= 100) {
          doneT = 30;
          up = [];
          down = [];
        }
      },
      draw(c: Canvas) {
        drawCloud(c, t, 0.05, 20, 0, false);
        drawGround(c, G, soil);
        c.sprite(0, G - 4, LAPTOP, 'rock');
        const bars = Math.floor(t / 2) % 5;
        c.put(3, G - 3, '>'.padEnd(bars + 1, '_'), 'accent');
        c.sprite(68, G - 5, SERVER, 'rock');
        for (let i = 0; i < 3; i++) {
          const on = (Math.floor(t / 3) + i) % 3 === 0 || doneT > 0;
          c.put(71, G - 4 + i, on ? '■■■■' : '····', on ? 'good' : 'cloud');
        }

        for (let x = 6; x < 73; x++) c.put(x, WIRE_Y, '-', 'cloud');
        c.put(5, WIRE_Y, '+', 'rock');
        c.put(73, WIRE_Y, '+', 'rock');
        for (let y = WIRE_Y + 1; y < G - 4; y++) {
          c.put(5, y, '|', 'rock');
          c.put(73, y, '|', 'rock');
        }
        for (const p of down) {
          c.put(p.x + 1, WIRE_Y, 'T', 'rock');
          c.put(p.x, WIRE_Y + 1, '[=]', 'accent');
        }

        const phase = Math.floor(t / 2) % 3;
        for (let x = BELT_L; x <= BELT_R + 2; x++) c.put(x, G - 1, (x + phase) % 3 === 0 ? 'o' : '=', 'rock');
        for (const p of up) c.put(p.x, G - 2, '[#]', 'dirt');

        c.sprite(11, G - 4, withFace(loadT > 3 ? LOAD_PUT : LOAD_REACH, doneT ? '^.^' : blink(t, 1)), 'agent');
        c.sprite(62, G - 4, withFace(unloadT > 3 ? mirror(LOAD_PUT) : LOAD_PUT, doneT ? '^.^' : blink(t, 2)), 'agent');
        const cx = 36 + Math.round(Math.sin(t * 0.05) * 6);
        c.sprite(cx, G - 7, withFace([' .-. ', '(o.o)', '(   )[='], doneT ? '^.^' : blink(t, 3, 'o.O')), 'agent');
        c.put(cx + 1, G - 4, "' '", 'agent');
        for (let y = WIRE_Y + 1; y < G - 3; y++) {
          c.put(cx - 1, y, '|', 'rock');
          c.put(cx + 7, y, '|', 'rock');
        }
        c.put(cx - 1, WIRE_Y, 'Y', 'rock');
        c.put(cx + 7, WIRE_Y, 'Y', 'rock');
        c.put(cx - 1, G - 3, '\\_______/', 'wood');
        if (doneT && t % 10 < 6) c.put(cx + 9, G - 7, '(listo!)', 'good');
      },
      status() {
        const lv = Math.round(progress / 20);
        return doneT ? 'sincronizado ✓' : `sincronizando ${'▮'.repeat(lv)}${'▯'.repeat(5 - lv)} ${progress}%`;
      },
    };
  },
};
