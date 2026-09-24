import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../domain/errors.js';

/**
 * Only `local` exists today. A future `remote` mode will add
 * `{ mode: 'remote', apiUrl }` as another member of this union.
 */
const localConfigSchema = z.object({
  mode: z.literal('local'),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  /**
   * Machine-specific folders that contain project repositories (e.g.
   * ~/workspace/products, ~/workspace/services). Their subfolders feed the
   * repository picker. Lives in the config, not the database, because paths
   * differ per computer.
   */
  parentFolders: z.array(z.string().min(1)).default([]),
});

export const configSchema = localConfigSchema;
export type SojaConfig = z.infer<typeof configSchema>;

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
        throw new ConfigError('Remote mode is not available in this version of SOJA.', {
          hint: `Set "mode": "local" in ${this.file}.`,
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
