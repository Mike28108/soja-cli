import { AGENT, blink, drawCloud, drawGround, mirror, rng, soilLine, withFace, type Canvas, type SceneDef } from '../engine.js';

const W = 78;
const H = 12;
const G = 10;
const TREE = ['   .--~~--.  ', ' .(  ~   ~ ). ', '(  ~   ~   ~ )', " '-.______.-' "];
const STRETCH = ['\\ .-. /', ' (o.O) ', ' (   ) ', "  ' '  "];
const COFFEE = [' .-.    ', '(o.o)c[]', '(___)   '];

export const resting: SceneDef<'resting'> = {
  id: 'resting',
  title: 'Descansando',
  useFor: 'Sin actividad / en pausa',
  width: W,
  height: H,
  create(seed = 2) {
    const r = rng(seed);
    const soil = [soilLine(W, r)];
    let t = 0;
    let zs: { x: number; y: number; l: number }[] = [];
    let leaves: { x: number; y: number }[] = [];
    return {
      step() {
        t++;
        const sw = Math.floor(t / 10) % 2;
        if (t % 14 === 0) zs.push({ x: 11, y: G - 3, l: 0 });
        if (t % 18 === 5) zs.push({ x: 39 + sw, y: G - 6, l: 0 });
        if (t % 25 === 0) leaves.push({ x: 1 + r() * 11, y: 5 });
        for (const z of zs) {
          z.l++;
          z.y -= 0.15;
          z.x += 0.12;
        }
        zs = zs.filter((z) => z.l < 22);
        for (const l of leaves) {
          l.y += 0.12;
          l.x += Math.sin(l.y * 2) * 0.3;
        }
        leaves = leaves.filter((l) => l.y < G - 0.5);
      },
      draw(c: Canvas) {
        drawCloud(c, t, 0.05, 10, 0);
        drawGround(c, G, soil);
        c.put(73, 0, '\\ | /', 'spark');
        c.put(73, 1, '- O -', 'spark');
        c.put(73, 2, '/ | \\', 'spark');
        c.sprite(0, 2, TREE, 'leaf');
        for (let y = 6; y < G; y++) c.put(6, y, '||', 'wood');

        c.put(10, G - 2, ' .-.____ ', 'agent');
        c.put(10, G - 1, '(-.-_____)', 'agent');

        const sip = t % 50 < 8;
        c.sprite(21, G - 3, withFace(COFFEE, sip ? '^.^' : blink(t, 1)), 'agent');
        c.put(26, G - 2, 'c[]', 'paper');
        c.put(27 + ((t >> 3) % 2), G - 3, '~', 'cloud');

        const sw = Math.floor(t / 10) % 2;
        for (let y = G - 5; y < G; y++) {
          c.put(33, y, '|', 'wood');
          c.put(49, y, '|', 'wood');
        }
        c.put(34, G - 4, '\\', 'wood');
        c.put(48, G - 4, '/', 'wood');
        c.put(35, G - 3, '\\___________/', 'wood');
        c.put(38 + sw, G - 5, ' .-.___', 'agent');
        c.put(38 + sw, G - 4, '(-.-___)', 'agent');

        if (Math.floor(t / 24) % 3 === 0) c.sprite(53, G - 4, STRETCH, 'agent');
        else c.sprite(54, G - 4, withFace(AGENT.stand, blink(t, 2)), 'agent');

        const ph = Math.floor(t / 15) % 4;
        c.sprite(62, G - 3, withFace(AGENT.sit, blink(t, 3)), 'agent');
        c.sprite(68, G - 3, withFace(mirror(AGENT.sit), ph === 1 ? '^.^' : blink(t, 4)), 'agent');
        if (ph === 0) c.put(61, G - 4, '(bla)', 'cloud');
        if (ph === 1) c.put(67, G - 4, '(jaja)', 'cloud');
        if (ph === 2) c.put(61, G - 4, '(...)', 'cloud');

        for (const z of zs) c.put(z.x, z.y, z.l < 8 ? 'z' : 'Z', 'cloud');
        for (const l of leaves) c.put(l.x, l.y, ',', 'leaf');
      },
      status() {
        return 'en pausa · recargando energía';
      },
    };
  },
};
