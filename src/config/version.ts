import { readFileSync } from 'node:fs';
import { z } from 'zod';

// package.json sits two levels above both src/config and dist/config.
const packageJson = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')));

export const APP_VERSION: string = packageJson.version;
