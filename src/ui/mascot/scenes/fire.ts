/* eslint-disable @typescript-eslint/no-non-null-assertion, prefer-const -- scene arrays are indexed within bounds; particle arrays are mutated in place. */
import { blink, drawCloud, drawGround, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef } from '../engine.js';

const W = 78;
const H = 13;
const G = 11;
const HOUSE_X = 60;
const PASS = [8, 15, 22, 29, 36, 43];
const THROWER = 50;
const REACH_L = ['  .-. ', ' (o.o)', '_(   )', "  ' ' "];
const REACH_R = [' .-.  ', '(o.o) ', '(   )_', " ' '  "];
const THROW = [' .-.  /', '(o.o)/ ', '(   )  ', " ' '   "];
const WELL = ['  ___  ', ' /___\\ ', '  | |  ', ' [   ] ', ' [___] '];
const HOUSE = ['    ____    ', '   /    \\   ', '  /______\\  ', '  |[]  []|  ', '  |  __  |  ', '  |_|  |_|  '];

export const fire: SceneDef<'fire'> = {
  id: 'fire',
  title: 'Apagando incendio',
  useFor: 'Tareas urgentes / incidente crítico',
  width: W,
  height: H,
  create(seed = 5) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let I = 10;
    let outT = 0;
    let throwT = 0;
    let thrown = 0;
    let buckets: { x: number }[] = [];
    let water: Particle[] = [];
    let smoke: { x: number; y: number; l: number; steam?: boolean }[] = [];
    let flames: number[] = [];

    return {
      step() {
        t++;
        if (t % 16 === 0) buckets.push({ x: 6 });
        for (const b of buckets) b.x += 0.5;
        if (buckets.length && buckets[0]!.x >= THROWER - 1) {
          buckets.shift();
          if (I > 0) {
            throwT = 8;
            thrown++;
            for (let i = 0; i < 6; i++) {
              water.push({ x: THROWER + 6, y: G - 4, vx: 0.75 + r() * 0.35, vy: -0.55 - r() * 0.25, ch: "'.:"[i % 3]!, tone: 'water' });
            }
          }
        }
        if (throwT) throwT--;
        for (const p of water) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1;
        }
        water = water.filter((p) => {
          if (p.x >= HOUSE_X + 2 && p.x <= HOUSE_X + 12 && I > 0) {
            I = Math.max(0, I - 0.25);
            smoke.push({ x: p.x, y: p.y, l: 0, steam: true });
            return false;
          }
          return p.y < G && p.x < W;
        });
        if (I > 0) {
          I = Math.min(10, I + 0.03);
          outT = 0;
          if (t % 3 === 0) smoke.push({ x: HOUSE_X + 2 + r() * 8, y: G - 2 - I * 0.6, l: 0 });
        } else {
          outT++;
          if (outT < 40 && t % 4 === 0) smoke.push({ x: HOUSE_X + 2 + r() * 8, y: G - 2, l: 0 });
          if (outT > 70) I = 2;
        }
        for (const s of smoke) {
          s.l++;
          s.y -= 0.2;
          s.x += 0.1 + Math.sin((s.l + s.x) * 0.4) * 0.1;
        }
        smoke = smoke.filter((s) => s.l < (s.steam ? 8 : 26) && s.y > -1);
        flames = [];
        for (let col = 0; col < 10; col++) {
          flames.push(Math.max(0, Math.round(I * 0.7 * (0.55 + 0.45 * Math.sin(t * 0.7 + col * 1.3)) + (r() - 0.5) * 1.4)));
        }
      },
      draw(c: Canvas) {
        drawCloud(c, t, 0.05, 0, 0);
        drawGround(c, G, soil);
        c.sprite(0, G - 5, WELL, 'rock');
        c.put(2, G - 2, '~~~', 'water');
        c.sprite(HOUSE_X, G - 6, HOUSE, 'wood');
        if (I > 0) {
          flames.forEach((h, col) => {
            const x = HOUSE_X + 2 + col;
            for (let k = 0; k < h; k++) {
              const top = k === h - 1;
              const ch = top ? "^'^"[(t + x) % 3]! : k < 2 ? 'wWw'[(t + x + k) % 3]! : ')(('[(t + x + k) % 3]!;
              c.put(x, G - 1 - k, ch, top || k > h * 0.6 ? 'flame' : 'fire');
            }
          });
        }
        const hot = I > 6;
        const out = I <= 0;
        PASS.forEach((x, i) => {
          const cx = x + 2.5;
          const b = buckets.find((b) => b.x + 1.5 > cx - 6 && b.x + 1.5 < cx + 4);
          const pose = b && b.x + 1.5 < cx ? REACH_L : REACH_R;
          c.sprite(x, G - 4, withFace(pose, out ? '^.^' : hot ? blink(t, i, '>.<') : blink(t, i)), 'agent');
        });
        for (const b of buckets) {
          c.put(b.x, G - 2, '\\_/', 'rock');
          c.put(b.x + 1, G - 3, '~', 'water');
        }
        c.sprite(THROWER, G - 4, withFace(throwT > 3 ? THROW : REACH_R, out ? '^.^' : hot ? '>.<' : blink(t, 9)), 'agent');
        if (throwT > 3) c.put(THROWER + 6, G - 5, '\\~/', 'water');
        if (hot && Math.floor(t / 20) % 2) c.put(7, G - 5, '(agua!)', 'cloud');
        if (out) {
          c.put(14, G - 5, '(uf!)', 'cloud');
          c.put(35, G - 5, '(listo)', 'cloud');
          if (t % 10 < 6) c.put(HOUSE_X + 5, G - 8, 'ok', 'good');
        }
        for (const p of water) c.put(p.x, p.y, p.ch, p.tone);
        for (const s of smoke) c.put(s.x, s.y, s.steam ? '~' : s.l < 8 ? '.' : s.l < 16 ? 'o' : 'O', 'cloud');
      },
      status() {
        const lv = Math.ceil(I / 2);
        return `fuego ${'▮'.repeat(lv)}${'▯'.repeat(5 - lv)} · baldes ${thrown}${I <= 0 ? ' · apagado' : ''}`;
      },
    };
  },
};
