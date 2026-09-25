import type { DOMElement } from 'ink';
import type { Layer } from './dispatcher.js';

/** A mouse event in terminal cells, 0-based from the top-left corner. */
export interface MouseEvent {
  kind: 'press' | 'release' | 'wheel-up' | 'wheel-down';
  button: 'left' | 'middle' | 'right' | 'none';
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * SGR mouse reports (`ESC [ < b ; x ; y M|m`). Ink strips the ESC and hands
 * the rest to `useInput`, so this recognizes them there before they could be
 * mistaken for keys.
 */
const SGR = /^\[<(\d+);(\d+);(\d+)([Mm])$/;

export function parseMouse(input: string): MouseEvent | null {
  const match = SGR.exec(input);
  if (!match) return null;
  const code = Number(match[1]);
  const x = Number(match[2]) - 1;
  const y = Number(match[3]) - 1;
  if (code & 64) return { kind: (code & 1) === 1 ? 'wheel-down' : 'wheel-up', button: 'none', x, y };
  const button = (['left', 'middle', 'right'] as const)[code & 3] ?? 'none';
  return { kind: match[4] === 'M' ? 'press' : 'release', button, x, y };
}

/** Terminal sequences: report presses, releases and the wheel, in SGR format. */
export const MOUSE_ON = '\u001b[?1000h\u001b[?1006h';
export const MOUSE_OFF = '\u001b[?1000l\u001b[?1006l';

/** Where an Ink element is on screen: its layout offsets summed up to the root. */
export function rectOf(element: DOMElement | null): Rect | null {
  const layout = element?.yogaNode?.getComputedLayout();
  if (!element || !layout) return null;
  let x = layout.left;
  let y = layout.top;
  for (let parent = element.parentNode; parent; parent = parent.parentNode) {
    const offset = parent.yogaNode?.getComputedLayout();
    if (offset) {
      x += offset.left;
      y += offset.top;
    }
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(layout.width), height: Math.round(layout.height) };
}

export interface MouseTarget {
  onClick?: (event: MouseEvent, rect: Rect) => void;
  onWheel?: (direction: 1 | -1, event: MouseEvent) => void;
}

interface Region {
  layer: Layer;
  order: number;
  rect: () => Rect | null;
  target: () => MouseTarget;
}

const contains = (rect: Rect, event: MouseEvent) =>
  event.x >= rect.x && event.x < rect.x + rect.width && event.y >= rect.y && event.y < rect.y + rect.height;

/**
 * Clickable regions, by layer like the keyboard: an open window catches
 * clicks before the screen under it. Within the top layer that contains the
 * point, the smallest region wins (a button inside a panel).
 */
export class MouseDispatcher {
  private regions: Region[] = [];
  private counter = 0;

  register(layer: Layer, rect: () => Rect | null, target: () => MouseTarget): () => void {
    const region = { layer, order: (this.counter += 1), rect, target };
    this.regions.push(region);
    return () => {
      this.regions = this.regions.filter((candidate) => candidate !== region);
    };
  }

  dispatch(event: MouseEvent): boolean {
    // Clicks act on press, like most terminal apps; releases are ignored.
    if (event.kind === 'release') return false;
    const hits = this.regions
      .map((region) => ({ region, rect: region.rect() }))
      .filter((hit): hit is { region: Region; rect: Rect } => hit.rect !== null && contains(hit.rect, event));
    const topLayer = Math.max(...hits.map((hit) => hit.region.layer));
    const candidates = hits
      .filter((hit) => hit.region.layer === topLayer)
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height || b.region.order - a.region.order);
    for (const { region, rect } of candidates) {
      const target = region.target();
      if (event.kind === 'press' && event.button === 'left' && target.onClick) {
        target.onClick(event, rect);
        return true;
      }
      if ((event.kind === 'wheel-up' || event.kind === 'wheel-down') && target.onWheel) {
        target.onWheel(event.kind === 'wheel-down' ? 1 : -1, event);
        return true;
      }
    }
    return false;
  }
}
