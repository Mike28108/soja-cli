#!/usr/bin/env node
/**
 * soja-cli and soja-backend keep their own copies of the domain rules (task
 * enums and workflow, naming, activity payloads). This fails when the copies
 * differ, so a rule never changes on one side only.
 *
 *   node scripts/check-domain.mjs [path/to/the/other/repository]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['task.ts', 'workflow.ts', 'naming.ts', 'activity.ts'];
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const other = resolve(process.argv[2] ?? process.env.SOJA_OTHER_REPO ?? join(here, '../../services/soja-backend'));

if (!existsSync(join(other, 'src/domain'))) {
  console.error(`✕ Cannot find the other repository at ${other}.`);
  console.error('  Pass its path: node scripts/check-domain.mjs <path>');
  process.exit(2);
}

const different = FILES.filter((file) => {
  const mine = readFileSync(join(here, 'src/domain', file), 'utf8');
  const theirs = readFileSync(join(other, 'src/domain', file), 'utf8');
  return mine !== theirs;
});

if (different.length) {
  console.error(`✕ Shared domain files differ from ${other}: ${different.join(', ')}`);
  console.error('  Copy the change to the other repository in the same release (see src/domain there).');
  process.exit(1);
}
console.log(`✓ Shared domain files match (${FILES.join(', ')})`);
