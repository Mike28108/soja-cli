/* eslint-disable @typescript-eslint/no-non-null-assertion -- scene arrays are indexed within their declared bounds. */
import { AGENT, blink, drawGround, mirror, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef, type Tone } from '../engine.js';

const W = 78;
const H = 13;
const G = 11;
const JUMP = ['\\.-./', '(^.^)', '(   )', " / \\ "];
const CHEER = [' .-. ', '(^.^)', '(   )/', " ' ' "];
const BOX = [" .----------. ", " |          | ", " |       // | ", " | \\\\   //  | ", " |  \\\\ //   | ", " |   \\V/    | ", " '----------' "];
const CONFETTI = ['*', '+', '.', 'o', '~', "'"];
const TONES: Tone[] = ['agent', 'accent', 'good', 'spark', 'water', 'flame'];

export const celebrate: SceneDef<'celebrate'> = {
  id: 'celebrate',
  title: 'Celebrando',
  useFor: 'Tarea completada / meta alcanzada',
  width: W,
  height: H,
  create(seed = 6) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    const agents = [3, 12, 21, 52, 61, 70].map((x, i) => ({ x, off: i * 3, m: i >= 3 }));
    let t = 0;
    let streak = 1;
    let confetti: Particle[] = [];
    let bursts: { x: number; y: number; l: number; tone: Tone }[] = [];

    return {
      step() {
        t++;
        for (let i = 0; i < 2; i++) {
          confetti.push({ x: r() * W, y: -1, vx: (r() - 0.5) * 0.3, vy: 0.15 + r() * 0.2, ch: CONFETTI[Math.floor(r() * CONFETTI.length)]!, tone: TONES[Math.floor(r() * TONES.length)]! });
        }
        for (const p of confetti) {
          p.x += p.vx + Math.sin((t + p.y * 3) * 0.3) * 0.15;
          p.y += p.vy;
        }
        confetti = confetti.filter((p) => p.y < G);
        if (t % 18 === 0) {
          bursts.push({ x: 8 + r() * (W - 16), y: 1 + r() * 3, l: 0, tone: TONES[Math.floor(r() * TONES.length)]! });
          if (t % 90 === 0) streak++;
        }
        for (const b of bursts) b.l++;
        bursts = bursts.filter((b) => b.l < 8);
      },
      draw(c: Canvas) {
        drawGround(c, G, soil);
        for (const b of bursts) {
          const rad = b.l * 0.9;
          const ch = b.l < 3 ? '*' : b.l < 6 ? '+' : '.';
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            c.put(b.x + Math.cos(ang) * rad * 2, b.y + Math.sin(ang) * rad * 0.8, ch, b.tone);
          }
          if (b.l < 2) c.put(b.x, b.y, 'o', 'spark');
        }
        const pulse = Math.floor(t / 6) % 2;
        c.sprite(32, G - 7, BOX, 'rock');
        c.sprite(32, G - 7, BOX.map((l) => l.replace(/[.\-|']/g, ' ')), pulse ? 'good' : 'leaf');
        agents.forEach((a, i) => {
          const ph = (t + a.off) % 12;
          const up = ph < 6 ? Math.round(Math.sin((ph / 6) * Math.PI) * 2) : 0;
          let sp: readonly string[] = up > 0 ? JUMP : i % 2 ? CHEER : withFace(AGENT.stand, '^.^');
          if (a.m) sp = mirror(sp);
          c.sprite(a.x, G - 4 - up, withFace(sp, blink(t, i, '^.^')), 'agent');
        });
        for (const p of confetti) c.put(p.x, p.y, p.ch, p.tone);
      },
      status() {
        return `tarea completada · racha x${streak}`;
      },
    };
  },
};
