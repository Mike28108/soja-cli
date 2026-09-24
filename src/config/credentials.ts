import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../domain/errors.js';

const credentialsSchema = z.object({
  /** Server URL → session token. */
  servers: z.record(z.string(), z.object({ token: z.string().min(1), username: z.string() })).default({}),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * Session tokens for SOJA servers, kept apart from config.json and readable
 * only by you (mode 0600). SOJA never stores Git or GitHub credentials.
 */
export class CredentialStore {
  constructor(private readonly file: string) {}

  token(apiUrl: string): string | null {
    return this.read().servers[normalize(apiUrl)]?.token ?? null;
  }

  save(apiUrl: string, token: string, username: string): void {
    const credentials = this.read();
    credentials.servers[normalize(apiUrl)] = { token, username };
    this.write(credentials);
  }

  remove(apiUrl: string): void {
    const credentials = this.read();
    const key = normalize(apiUrl);
    this.write({ servers: Object.fromEntries(Object.entries(credentials.servers).filter(([server]) => server !== key)) });
  }

  private read(): Credentials {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return { servers: {} };
    }
    const parsed = credentialsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new ConfigError(`${this.file} has an unexpected shape.`, { hint: 'Delete it and run `soja login` again.' });
    return parsed.data;
  }

  private write(credentials: Credentials): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, this.file);
    } catch (error) {
      throw new ConfigError(`Could not write ${this.file}.`, { cause: error });
    }
  }
}

export function normalize(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}
