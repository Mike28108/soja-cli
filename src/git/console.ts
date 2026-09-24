import { terminalSafe } from '../utils/text.js';

export type ConsoleLineKind = 'command' | 'stdout' | 'stderr' | 'info' | 'success' | 'error';

export interface ConsoleLine {
  id: number;
  kind: ConsoleLineKind;
  text: string;
  at: Date;
}

/**
 * Live record of what SOJA runs in Git. Mutating commands and their output
 * stream here line by line; the interface subscribes to show it as it happens.
 * Keeps the last `capacity` lines in memory (never written to disk).
 */
export class GitConsole {
  private lines: ConsoleLine[] = [];
  private listeners = new Set<() => void>();
  private counter = 0;

  constructor(private readonly capacity = 500) {}

  write(kind: ConsoleLineKind, text: string): void {
    for (const part of terminalSafe(text.replace(/\r/g, '\n')).split('\n')) {
      if (!part.trim()) continue;
      this.lines.push({ id: (this.counter += 1), kind, text: part, at: new Date() });
    }
    if (this.lines.length > this.capacity) this.lines = this.lines.slice(-this.capacity);
    for (const listener of this.listeners) listener();
  }

  /** Lines written after `afterId` (0 for all). */
  since(afterId = 0): ConsoleLine[] {
    return this.lines.filter((line) => line.id > afterId);
  }

  get lastId(): number {
    return this.counter;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
