// tsc only emits JS; SQL migrations must ship next to the compiled migrator.
import { cpSync } from 'node:fs';

cpSync('src/database/migrations', 'dist/database/migrations', { recursive: true });
