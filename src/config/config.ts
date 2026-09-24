import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../domain/errors.js';

const remoteSchema = z.object({
  /** SOJA server, e.g. https://api.soja.dev (the token lives in credentials.json). */
  apiUrl: z.string().url(),
  /** Active workspace on the server. */
  workspaceId: z.string().min(1).optional(),
  /** Project id → local repository folder. Paths differ per developer, so they never go to the server. */
  repositoryPaths: z.record(z.string(), z.string()).default({}),
});

/**
 * Both modes live side by side so switching never loses the other one:
 * `local` uses userId/workspaceId against SQLite; `remote` uses the
 * `remote` block against a SOJA server.
 */
export const configSchema = z
  .object({
    mode: z.enum(['local', 'remote']).default('local'),
    userId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    /**
     * Machine-specific folders that contain project repositories (e.g.
     * ~/workspace/products, ~/workspace/services). Their subfolders feed the
     * repository picker.
     */
    parentFolders: z.array(z.string().min(1)).default([]),
    remote: remoteSchema.optional(),
  })
  .refine((config) => config.mode !== 'remote' || config.remote !== undefined, {
    error: 'Remote mode needs a server.',
    path: ['remote'],
  });

export type SojaConfig = z.infer<typeof configSchema>;
export type RemoteSettings = z.infer<typeof remoteSchema>;

export interface ConfigStore {
  load(): SojaConfig | null;
  save(config: SojaConfig): void;
}

export class FileConfigStore implements ConfigStore {
  constructor(private readonly file: string) {}

  load(): SojaConfig | null {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return null;
      throw new ConfigError(`Could not read ${this.file}.`, { cause: error });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      throw new ConfigError(`${this.file} is not valid JSON.`, {
        hint: 'Fix the file or delete it to run setup again.',
        cause: error,
      });
    }

    const parsed = configSchema.safeParse(json);
    if (!parsed.success) {
      const mode = typeof json === 'object' && json !== null && 'mode' in json ? json.mode : undefined;
      if (mode === 'remote') {
        throw new ConfigError('Remote mode is set but no server is configured.', {
          hint: 'Run `soja login --server <url>`, or `soja mode local`.',
        });
      }
      throw new ConfigError(`${this.file} has an unexpected shape.`, {
        hint: 'Delete it to run setup again.',
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  save(config: SojaConfig): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      renameSync(temp, this.file);
    } catch (error) {
      throw new ConfigError(`Could not write ${this.file}.`, { cause: error });
    }
  }
}

export class MemoryConfigStore implements ConfigStore {
  constructor(private config: SojaConfig | null = null) {}

  load(): SojaConfig | null {
    return this.config;
  }

  save(config: SojaConfig): void {
    this.config = config;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
