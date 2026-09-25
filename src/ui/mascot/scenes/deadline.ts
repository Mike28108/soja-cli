import { blink, drawGround, mirror, rng, soilLine, withFace, type Canvas, type Particle, type SceneDef } from '../engine.js';

const W = 78;
const H = 13;
const G = 11;
const RUN_A = [' .-.  ', '(o.o)=', '(   ) ', " / \\  "];
const RUN_B = [' .-.  ', '(o.o)=', '(   ) ', "  |\\  "];
const TYPE_A = [' .-.  ', '(o.o) ', '(   )/'];
const TYPE_B = [' .-.  ', '(o.o) ', '(   )\\'];

export const deadline: SceneDef<'deadline'> = {
  id: 'deadline',
  title: 'Contra reloj',
  useFor: 'Tareas vencidas o por vencer',
  width: W,
  height: H,
  create(seed = 10) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    const runners = [
      { x: 24, v: 0.9, n: 1 },
      { x: 50, v: -1.1, n: 2 },
      { x: 66, v: -0.8, n: 3 },
    ];
    let t = 0;
    let secs = 59;
    let delivered = 0;
    let doneT = 0;
    let papers: Particle[] = [];
    let sweat: Particle[] = [];
    let taps = 0;

    return {
      step() {
        t++;
        if (doneT) {
          doneT--;
          if (!doneT) secs = 59;
        } else {
          if (t % 5 === 0) secs--;
          if (secs <= 0) {
            secs = 0;
            doneT = 30;
            delivered++;
          }
        }
        const speedUp = !doneT && secs < 15 ? 1.4 : 1;
        for (const a of runners) {
          if (doneT) continue;
          a.x += a.v * speedUp;
          if (a.x < 22 || a.x > W - 7) {
            a.v = -a.v;
            a.x = Math.max(22, Math.min(W - 7, a.x));
            if (r() < 0.6) papers.push({ x: a.x + 3, y: G - 3, vx: (r() - 0.5) * 1.2, vy: -0.6, ch: '▭', tone: 'paper' });
          }
          if (t % 6 === a.n) sweat.push({ x: a.x + (a.v > 0 ? 0 : 5), y: G - 4, vx: -Math.sign(a.v) * 0.4, vy: -0.3, ch: "'", tone: 'water' });
        }
        if (!doneT) taps++;
        for (const p of papers) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.06;
          p.vx *= 0.97;
        }
        papers = papers.filter((p) => p.y < G);
        for (const s of sweat) {
          s.x += s.vx;
          s.y += s.vy;
          s.vy += 0.1;
        }
        sweat = sweat.filter((s) => s.y < G);
      },
      draw(c: Canvas) {
        drawGround(c, G, soil);
        const urgent = !doneT && secs < 15;
        const clockTone = doneT ? 'good' : urgent && t % 6 < 3 ? 'bad' : 'text';
        c.put(29, 0, ' .--------------. ', 'rock');
        c.put(29, 1, ' |              | ', 'rock');
        c.put(29, 2, " '--------------' ", 'rock');
        c.put(doneT ? 33 : 34, 1, doneT ? 'entregado!' : `23:59:${String(secs).padStart(2, '0')}`, clockTone);
        if (urgent) {
          c.put(26, 1, '!!', 'bad');
          c.put(49, 1, '!!', 'bad');
        }

        c.put(1, G - 3, '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄', 'wood');
        c.put(2, G - 2, '||', 'wood');
        c.put(2, G - 1, '||', 'wood');
        c.put(13, G - 2, '||', 'wood');
        c.put(13, G - 1, '||', 'wood');
        c.put(9, G - 6, '.----.', 'rock');
        c.put(9, G - 5, '|' + (doneT ? ' ok ' : '#'.repeat(Math.floor(t / 2) % 5).padEnd(4, '_')) + '|', doneT ? 'good' : 'accent');
        c.put(9, G - 4, "'----'", 'rock');
        c.put(9, G - 5, '|', 'rock');
        c.put(14, G - 5, '|', 'rock');
        c.sprite(3, G - 6, withFace(taps % 2 ? TYPE_A : TYPE_B, doneT ? '^.^' : urgent ? '>.<' : 'O.O'), 'agent');
        if (!doneT && t % 4 < 2) c.put(7, G - 7, 'tap', 'cloud');
        c.put(16, G - 4, '▭▭', 'paper');
        c.put(16, G - 5, '▭', 'paper');

        runners.forEach((a, i) => {
          const face = doneT ? '^.^' : urgent ? '>.<' : blink(t, i, 'O.O');
          let sp: readonly string[] = doneT ? [' .-. ', '(o.o)', '(   )', " ' ' "] : Math.floor(t / 2) % 2 ? RUN_A : RUN_B;
          if (a.v < 0 && !doneT) sp = mirror(sp);
          c.sprite(a.x, G - 4, withFace(sp, face), 'agent');
          if (!doneT) c.put(a.v > 0 ? a.x + 6 : a.x - 1, G - 3, '▭', 'paper');
        });
        if (doneT && t % 8 < 5) c.put(40, G - 6, '(lo logramos!)', 'good');
        for (const p of papers) c.put(p.x, p.y, p.ch, p.tone);
        for (const s of sweat) c.put(s.x, s.y, s.ch, s.tone);
      },
      status() {
        return doneT ? `entregado a tiempo · ${delivered} entregas` : `vence en ${secs}s · ${delivered} entregas`;
      },
    };
  },
};
