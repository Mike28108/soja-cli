import { blink, drawGround, mirror, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const BUG_A = [' \\  / ', '=(oo)=', ' /  \\ '];
const BUG_B = [' /  \\ ', '=(oo)=', ' \\  / '];
const NET_UP = [' .-. (@)', '(o.o)/  ', '(   )   ', " ' '    "];
const NET_DOWN = [' .-.    ', '(o.o)   ', '(   )\\  ', " ' ' (@)"];
const MAGNIFY = [' .-.   ', '(o.o)  ', '(   )-O', " ' '   "];
const SCARED = ['\\.-./', '(O.O)', '(   )', " ' ' "];
const CRATE_X = 36;

export const bugHunt: SceneDef<'bugHunt'> = {
  id: 'bugHunt',
  title: 'Cazando bugs',
  useFor: 'Errores / tareas bloqueadas',
  width: W,
  height: H,
  create(seed = 8) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let bx = 60;
    let bv = -0.7;
    let netX = 10;
    let magX = 2;
    let swing = 0;
    let caught = 0;
    let respawn = 0;
    let caughtFlash = 0;
    let dust: Particle[] = [];

    return {
      step() {
        t++;
        if (respawn) {
          respawn--;
          if (!respawn) {
            bx = r() < 0.5 ? 2 : W - 8;
            bv = bx < 10 ? 0.7 : -0.7;
          }
        } else {
          if (r() < 0.04) bv = -bv;
          if (r() < 0.02) bv *= 1.8;
          bv = Math.max(-1.3, Math.min(1.3, bv));
          if (Math.abs(bv) > 0.8 && r() < 0.1) bv *= 0.6;
          bx += bv;
          if (bx < 1 || bx > W - 7) {
            bv = -bv;
            bx = Math.max(1, Math.min(W - 7, bx));
          }
          if (t % 3 === 0) dust.push({ x: bx + (bv > 0 ? 0 : 5), y: G - 1, vx: -bv * 0.3, vy: -0.1, ch: '.', tone: 'soil', life: 0 });
        }
        const target = bx + 3;
        const netFacesRight = target >= netX + 3;
        const goal = netFacesRight ? target - 6 : target;
        netX += Math.sign(goal - netX) * Math.min(0.6, Math.abs(goal - netX));
        magX += Math.sign(netX - 9 - magX) * Math.min(0.35, Math.abs(netX - 9 - magX));
        if (swing) swing--;
        else if (!respawn && Math.abs(goal - netX) < 3 && t % 8 === 0) swing = 6;
        if (swing === 3 && !respawn) {
          const netPoint = netFacesRight ? netX + 6 : netX - 1;
          if (Math.abs(netPoint - target) < 2.5) {
            caught++;
            respawn = 30;
            caughtFlash = 14;
          }
        }
        if (caughtFlash) caughtFlash--;
        for (const d of dust) {
          d.x += d.vx;
          d.y += d.vy;
          d.life = (d.life ?? 0) + 1;
        }
        dust = dust.filter((d) => (d.life ?? 0) < 6);
      },
      draw(c: Canvas) {
        drawGround(c, G, soil);
        c.put(CRATE_X - 1, G - 2, '[_____]', 'wood');
        c.put(CRATE_X - 1, G - 1, '[_____]', 'wood');
        const near = !respawn && Math.abs(bx + 3 - (CRATE_X + 2)) < 10;
        c.sprite(CRATE_X, G - 6, near ? SCARED : withFace([' .-. ', '(o.o)', '(   )', " ' ' "], blink(t, 3)), 'agent');
        if (near && t % 8 < 5) c.put(CRATE_X + 6, G - 7, '(!!)', 'cloud');

        if (!respawn) {
          c.sprite(bx, G - 3, Math.floor(t / 2) % 2 ? BUG_A : BUG_B, 'leaf');
        }
        for (const d of dust) c.put(d.x, d.y, d.ch, d.tone);

        const right = bx + 3 >= netX + 3;
        let net = swing > 3 ? NET_UP : swing > 0 ? NET_DOWN : NET_UP;
        if (!right) net = mirror(net);
        const nx = right ? netX : netX - 3;
        c.sprite(nx, G - 4, withFace(net, caughtFlash ? '^.^' : '>.<'), 'agent');
        if (caughtFlash) {
          const px = right ? nx + 5 : nx;
          c.put(px, G - 5, '(@)', 'leaf');
          if (t % 6 < 4) c.put(nx - 1, G - 6, '(te tengo!)', 'good');
        }
        c.sprite(magX, G - 4, withFace(MAGNIFY, blink(t, 5, 'o.O')), 'agent');
      },
      status() {
        return respawn ? `bug atrapado · total ${caught}` : `persiguiendo bug · atrapados ${caught}`;
      },
    };
  },
};
