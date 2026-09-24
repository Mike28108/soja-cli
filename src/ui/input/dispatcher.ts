import type { Key } from 'ink';

/** Return `true` when the key was handled, so lower layers never see it. */
export type KeyHandler = (input: string, key: Key) => boolean | void;

/**
 * Who gets a key first. Text fields beat overlays, overlays beat screens,
 * screens beat global shortcuts. That ordering is what lets `p` mean
 * "priority" in a task and "projects" everywhere else, and keeps Esc
 * predictable: the topmost thing always closes first.
 */
export const Layer = { global: 0, screen: 10, overlay: 20, input: 30 } as const;
export type Layer = (typeof Layer)[keyof typeof Layer];

interface Entry {
  layer: Layer;
  order: number;
  handler: KeyHandler;
}

export class KeyDispatcher {
  private entries: Entry[] = [];
  private counter = 0;

  register(layer: Layer, handler: KeyHandler): () => void {
    const entry = { layer, order: (this.counter += 1), handler };
    this.entries.push(entry);
    return () => {
      this.entries = this.entries.filter((candidate) => candidate !== entry);
    };
  }

  dispatch(input: string, key: Key): boolean {
    const ordered = [...this.entries].sort((a, b) => b.layer - a.layer || b.order - a.order);
    for (const entry of ordered) {
      if (entry.handler(input, key) === true) return true;
    }
    return false;
  }
}
