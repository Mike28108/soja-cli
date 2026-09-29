import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { normalize } from '../config/credentials.js';
import { ConfigError } from '../domain/errors.js';

const key = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const trustedSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(['owner', 'member']),
  label: z.string(),
  encryptionKey: key,
  signingKey: key,
  fingerprint: z.string(),
  trustedAt: z.string(),
  /** First sight (TOFU) or confirmed by a person comparing fingerprints. */
  how: z.enum(['first-use', 'confirmed']),
});

const serverSchema = z.object({
  device: z.object({
    id: z.string(),
    label: z.string(),
    secrets: z.object({ encryptionPrivateKey: z.string(), signingPrivateKey: z.string(), encryptionKey: key, signingKey: key }),
  }).optional(),
  /** Devices of other people (and your other machines) this one trusts, by device id, per workspace. */
  trusted: z.record(z.string(), z.record(z.string(), trustedSchema)).default({}),
  /** Workspaces this machine already worked with: owners are no longer taken on first use there. */
  introduced: z.record(z.string(), z.boolean()).default({}),
});

const fileSchema = z.object({ servers: z.record(z.string(), serverSchema).default({}) });

export type ThisDevice = NonNullable<z.infer<typeof serverSchema>['device']>;
export type TrustedDevice = z.infer<typeof trustedSchema>;

/**
 * This machine's device keys and the devices it trusts, per SOJA server.
 * The private keys never leave this file, which only you can read (0600).
 */
export class EnvKeyStore {
  constructor(private readonly file: string) {}

  device(apiUrl: string): ThisDevice | null {
    return this.read().servers[normalize(apiUrl)]?.device ?? null;
  }

  saveDevice(apiUrl: string, device: ThisDevice): void {
    this.update(apiUrl, (server) => ({ ...server, device }));
  }

  forgetDevice(apiUrl: string): void {
    this.update(apiUrl, (server) => ({ trusted: server.trusted, introduced: server.introduced }));
  }

  introduced(apiUrl: string, workspaceId: string): boolean {
    return this.read().servers[normalize(apiUrl)]?.introduced[workspaceId] === true;
  }

  markIntroduced(apiUrl: string, workspaceId: string): void {
    if (this.introduced(apiUrl, workspaceId)) return;
    this.update(apiUrl, (server) => ({ ...server, introduced: { ...server.introduced, [workspaceId]: true } }));
  }

  trusted(apiUrl: string, workspaceId: string): Record<string, TrustedDevice> {
    return this.read().servers[normalize(apiUrl)]?.trusted[workspaceId] ?? {};
  }

  trust(apiUrl: string, workspaceId: string, deviceId: string, device: TrustedDevice): void {
    this.update(apiUrl, (server) => ({ ...server, trusted: { ...server.trusted, [workspaceId]: { ...server.trusted[workspaceId], [deviceId]: device } } }));
  }

  untrust(apiUrl: string, workspaceId: string, deviceId: string): void {
    this.update(apiUrl, (server) => {
      const devices = Object.fromEntries(Object.entries(server.trusted[workspaceId] ?? {}).filter(([id]) => id !== deviceId));
      return { ...server, trusted: { ...server.trusted, [workspaceId]: devices } };
    });
  }

  private update(apiUrl: string, change: (server: z.infer<typeof serverSchema>) => z.infer<typeof serverSchema>): void {
    const data = this.read();
    const name = normalize(apiUrl);
    data.servers[name] = change(data.servers[name] ?? { trusted: {}, introduced: {} });
    this.write(data);
  }

  private read(): z.infer<typeof fileSchema> {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return { servers: {} };
    }
    // Someone widened the permissions: close them again before trusting the contents.
    if ((statSync(this.file).mode & 0o077) !== 0) chmodSync(this.file, 0o600);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      throw new ConfigError(`${this.file} is not valid JSON.`, { hint: 'Restore it from a backup, or delete it and run `soja env setup` again (your devices must then be re-shared).', cause: error });
    }
    const parsed = fileSchema.safeParse(json);
    if (!parsed.success) throw new ConfigError(`${this.file} has an unexpected shape.`, { hint: 'Delete it and run `soja env setup` again.' });
    return parsed.data;
  }

  private write(data: z.infer<typeof fileSchema>): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, this.file);
    } catch (error) {
      throw new ConfigError(`Could not write ${this.file}.`, { cause: error });
    }
  }
}
