import type { LiveEvent } from '../sync/engine.js';
import { parseServerJson } from './api-client.js';

export interface LiveOptions {
  apiUrl: string;
  token: string;
  workspaceId: string;
  onEvent(event: LiveEvent): void;
  /** Called on every (re)connection once authenticated: the caller catches up with a sync. */
  onReady(): void;
  /** Tests inject a WebSocket implementation; Node's global one otherwise. */
  WebSocket?: typeof WebSocket;
}

const MAX_BACKOFF_MS = 30_000;
/** Closes that mean retrying cannot help (bad token or no access). */
const FATAL_CLOSE = new Set([4401, 4403]);

/**
 * The real-time channel to the SOJA server (`/v1/live`). It only notifies:
 * messages still travel as sync operations, so nothing is lost while it is
 * down. Reconnects with exponential backoff (1 s → 30 s).
 */
export class LiveConnection {
  private socket: WebSocket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private stopped = false;
  private ready = false;

  constructor(private readonly options: LiveOptions) {}

  get connected(): boolean {
    return this.ready;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ready = false;
    this.socket?.close(1000);
    this.socket = null;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = new URL('/v1/live', this.options.apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const Socket = this.options.WebSocket ?? globalThis.WebSocket;
    let socket: WebSocket;
    try {
      socket = new Socket(url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      // The token goes in the first message, never in the URL (URLs end up in logs).
      socket.send(JSON.stringify({ type: 'auth', token: this.options.token, workspaceId: this.options.workspaceId }));
    });
    socket.addEventListener('message', (message) => {
      let event: { type?: string };
      try {
        event = parseServerJson<{ type?: string }>(String(message.data));
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.ready = true;
        this.attempts = 0;
        this.options.onReady();
      } else if (this.ready && typeof event.type === 'string') {
        this.options.onEvent(event as LiveEvent);
      }
    });
    socket.addEventListener('close', (event) => {
      this.ready = false;
      if (this.socket === socket) this.socket = null;
      if (!FATAL_CLOSE.has(event.code)) this.retry();
    });
    // An 'error' is always followed by 'close', which schedules the retry.
    socket.addEventListener('error', () => undefined);
  }

  private retry(): void {
    if (this.stopped || this.timer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
    this.timer.unref();
  }
}
