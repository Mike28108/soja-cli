import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationError } from '../domain/errors.js';
import type { GitClient } from '../git/types.js';
import { expandHome, tildify } from '../utils/text.js';

/** The top-level folder of the Git repository containing `path` (`~` allowed), or a friendly error. */
export async function resolveRepositoryRoot(git: GitClient, path: string): Promise<string> {
  const absolute = resolve(expandHome(path.trim()));
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new ValidationError(`${tildify(absolute)} does not exist or is not a folder.`);
  }
  const root = await git.repositoryRoot(absolute);
  if (!root) {
    throw new ValidationError(`${tildify(absolute)} is not inside a Git repository.`, {
      hint: 'Run `git init` there first, or point to the repository folder.',
    });
  }
  return root;
}
