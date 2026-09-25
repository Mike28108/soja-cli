/* eslint-disable prefer-const -- the bird list is mutated in place by the scene engine. */
import { blink, drawCloud, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const WATER_Y = 8;
const SHORE = 30;
const DOCK_L = 28;
const DOCK_R = 50;
const FISHER_X = 43;
const TREE = ['  .--.  ', ' (    ) ', '(  ~   )', " '-..-' "];
const SIT_ROD = [' .-.  ', '(o.o)/', '(___) '];
const SIT_PULL = [' .-. |', '(o.o)|', '(___) '];

export const empty: SceneDef<'empty'> = {
  id: 'empty',
  title: 'Pescando',
  useFor: 'Lista vacía / sin tareas pendientes',
  width: W,
  height: H,
  create(seed = 9) {
    const r = rng(seed);
    const soil = [soilLine(SHORE, r), soilLine(SHORE, r), soilLine(SHORE, r)];
    let t = 0;
    let fish = 0;
    let boots = 0;
    let phase: 'wait' | 'bite' | 'pull' = 'wait';
    let k = 0;
    let waitFor = 50;
    let catchKind: 'fish' | 'boot' = 'fish';
    let flying: Particle | null = null;
    let happy = 0;
    let zs: { x: number; y: number; l: number }[] = [];
    let weed = -10;
    let birds = [{ x: 70, y: 1 }];

    return {
      step() {
        t++;
        k++;
        if (phase === 'wait' && k > waitFor) {
          phase = 'bite';
          k = 0;
        } else if (phase === 'bite' && k > 10) {
          phase = 'pull';
          k = 0;
          catchKind = r() < 0.7 ? 'fish' : 'boot';
          flying = { x: FISHER_X + 9, y: WATER_Y, vx: -0.9, vy: -0.9, ch: catchKind === 'fish' ? '><>' : '_|', tone: catchKind === 'fish' ? 'water' : 'wood' };
        } else if (phase === 'pull' && k > 14) {
          phase = 'wait';
          k = 0;
          waitFor = 40 + Math.floor(r() * 50);
          if (catchKind === 'fish') fish++;
          else boots++;
          happy = 16;
          flying = null;
        }
        if (flying) {
          flying.x += flying.vx;
          flying.y += flying.vy;
          flying.vy += 0.14;
          if (flying.y > WATER_Y - 2) flying.y = WATER_Y - 2;
        }
        if (happy) happy--;
        if (t % 16 === 0) zs.push({ x: 8, y: WATER_Y - 3, l: 0 });
        for (const z of zs) {
          z.l++;
          z.y -= 0.15;
          z.x += 0.1;
        }
        zs = zs.filter((z) => z.l < 20);
        weed += 0.4;
        if (weed > SHORE + 6) weed = -30 - r() * 40;
        for (const b of birds) {
          b.x -= 0.25;
          if (b.x < -4) {
            b.x = W + r() * 20;
            b.y = 1 + Math.floor(r() * 3);
          }
        }
      },
      draw(c: Canvas) {
        drawCloud(c, t, 0.04, 30, 0);
        for (let x = 0; x < SHORE; x++) c.set(x, WATER_Y, '▀', 'soil');
        soil.forEach((l, i) => c.put(0, WATER_Y + 1 + i, l, 'soil'));
        for (let y = WATER_Y; y < H; y++) {
          for (let x = SHORE; x < W; x++) {
            const v = (x + y * 3 + Math.floor(t / 3)) % 7;
            c.put(x, y, y === WATER_Y ? (v < 3 ? '~' : '-') : v === 0 ? '~' : ' ', 'water');
          }
        }
        c.sprite(1, WATER_Y - 7, TREE, 'leaf');
        c.put(4, WATER_Y - 3, '||', 'wood');
        c.put(4, WATER_Y - 2, '||', 'wood');
        c.put(4, WATER_Y - 1, '||', 'wood');
        c.put(7, WATER_Y - 2, ' .-.____ ', 'agent');
        c.put(7, WATER_Y - 1, '(-.-_____)', 'agent');
        for (const z of zs) c.put(z.x, z.y, z.l < 8 ? 'z' : 'Z', 'cloud');
        if (weed > -3) c.put(weed, WATER_Y - 1, '@', 'dirt');

        for (let x = DOCK_L; x <= DOCK_R; x++) c.put(x, WATER_Y - 1, '=', 'wood');
        for (const px of [DOCK_L + 3, DOCK_R - 2]) for (let y = WATER_Y; y < H - 1; y++) c.put(px, y, '|', 'wood');
        c.put(FISHER_X - 7, WATER_Y - 2, '\\_/', 'rock');
        if (fish) c.put(FISHER_X - 6, WATER_Y - 3, '>', 'water');

        const face = happy ? (catchKind === 'fish' ? '^.^' : '-_-') : phase === 'bite' ? 'O.O' : blink(t, 1);
        const pulling = phase === 'pull';
        c.sprite(FISHER_X, WATER_Y - 4, withFace(pulling ? SIT_PULL : SIT_ROD, face), 'agent');
        if (pulling) {
          c.put(FISHER_X + 5, WATER_Y - 6, '|', 'wood');
          c.put(FISHER_X + 5, WATER_Y - 7, '.', 'wood');
        } else {
          c.put(FISHER_X + 6, WATER_Y - 5, '/', 'wood');
          c.put(FISHER_X + 7, WATER_Y - 6, '/', 'wood');
          c.put(FISHER_X + 8, WATER_Y - 7, '.', 'wood');
          for (let y = WATER_Y - 6; y < WATER_Y; y++) c.put(FISHER_X + 9, y, ':', 'cloud');
          const bob = phase === 'bite' ? (t % 4 < 2 ? 1 : 0) : Math.floor(t / 8) % 2 ? 0 : 0;
          c.put(FISHER_X + 9, WATER_Y + bob, 'o', 'fire');
          if (phase === 'bite') {
            c.put(FISHER_X + 8, WATER_Y, '(', 'water');
            c.put(FISHER_X + 10, WATER_Y, ')', 'water');
            c.put(FISHER_X + 1, WATER_Y - 6, '!', 'spark');
          }
        }
        if (flying) c.put(flying.x, flying.y, flying.ch, flying.tone);
        if (happy && t % 6 < 4) c.put(FISHER_X - 2, WATER_Y - 6, catchKind === 'fish' ? '(uno más!)' : '(una bota?)', 'cloud');
        for (const b of birds) c.put(b.x, b.y, Math.floor(t / 4) % 2 ? 'v' : '-v-', 'cloud');
      },
      status() {
        return `sin tareas pendientes · peces ${fish} · botas ${boots}`;
      },
    };
  },
};
