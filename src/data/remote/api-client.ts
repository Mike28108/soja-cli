import { ConflictError, NotFoundError, SojaError, ValidationError } from '../../domain/errors.js';
import { terminalSafe } from '../../utils/text.js';

/** The server could not be reached at all (as opposed to answering with an error). */
export class OfflineError extends SojaError {}

/** The server rejected the session token. */
export class SessionExpiredError extends SojaError {}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; hint?: string };
}

/** `…At` fields arrive as ISO strings; the rest of SOJA works with Dates. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
/**
 * Every string from the server is made terminal-safe here, the single door
 * remote data comes through (other people's titles, comments, names…), and
 * `…At` fields become Dates.
 */
function reviveDates(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (key.endsWith('At') && ISO_DATE.test(value)) return new Date(value);
  return terminalSafe(value);
}

/**
 * JSON over HTTPS to a SOJA server. Server errors become the same error
 * classes local mode throws, so the interface shows them the same way.
 */
export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string | null,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /** Like `post`, but also returns the HTTP status (for the login poll's 202). */
  async postWithStatus<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
    const response = await this.send('POST', path, body);
    return { status: response.status, body: await this.parse<T>(response) };
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.parse<T>(await this.send(method, path, body));
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new OfflineError(`Could not reach the SOJA server at ${this.baseUrl}.`, {
        hint: 'Check your connection. Remote mode needs the server (offline work arrives in v0.4); `soja mode local` works offline.',
        cause: error,
      });
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text, reviveDates) : null;
    if (response.ok) return data as T;

    const error = (data as ApiErrorBody | null)?.error;
    const message = error?.message ?? `The SOJA server answered ${response.status}.`;
    const options = { ...(error?.hint ? { hint: error.hint } : {}) };
    if (response.status === 401) {
      throw new SessionExpiredError(message, { hint: error?.hint ?? 'Run `soja login`.' });
    }
    if (response.status === 400) throw new ValidationError(message, options);
    if (response.status === 404) throw new NotFoundError(message, options);
    if (response.status === 409) throw new ConflictError(message, options);
    throw new SojaError(message, options);
  }
}
