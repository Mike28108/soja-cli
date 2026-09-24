import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { ConfigStore } from '../../config/config.js';
import { ConflictError, NotFoundError, SojaError, ValidationError } from '../../domain/errors.js';
import { expandHome, tildify } from '../../utils/text.js';

export interface FolderEntry {
  name: string;
  /** Real (symlink-resolved) absolute path, comparable with linked repository paths. */
  path: string;
  isGitRepository: boolean;
}

export interface ParentFolder {
  path: string;
  /** False when the folder was moved or deleted since it was added. */
  available: boolean;
  children: FolderEntry[];
}

/**
 * Parent folders ("where my repositories live") and their subfolders, for
 * picking a project repository from a list instead of typing paths.
 * Everything here is local to this machine.
 */
export class FolderService {
  constructor(private readonly config: ConfigStore) {}

  list(): string[] {
    return this.config.load()?.parentFolders ?? [];
  }

  add(path: string): string[] {
    if (!path.trim()) throw new ValidationError('Type the path of a folder.');
    const absolute = resolve(expandHome(path.trim()));
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      throw new ValidationError(`${tildify(absolute)} does not exist or is not a folder.`);
    }
    const folders = this.list();
    if (folders.includes(absolute)) throw new ConflictError(`${tildify(absolute)} is already a parent folder.`);
    this.save([...folders, absolute]);
    return this.list();
  }

  /** Removes by exact path (`~` allowed) or by folder name when that is unambiguous. */
  remove(pathOrName: string): string[] {
    const target = this.find(pathOrName);
    this.save(this.list().filter((folder) => folder !== target));
    return this.list();
  }

  /** Every parent folder with its immediate subfolders, like `ls -1` (hidden folders skipped). */
  browse(): ParentFolder[] {
    return this.list().map((path) => {
      let names: string[];
      try {
        names = readdirSync(path, { withFileTypes: true })
          .filter((entry) => !entry.name.startsWith('.') && isDirectory(path, entry.name, entry.isDirectory(), entry.isSymbolicLink()))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      } catch {
        return { path, available: false, children: [] };
      }
      return {
        path,
        available: true,
        children: names.map((name) => {
          const full = join(path, name);
          return { name, path: safeRealpath(full), isGitRepository: existsSync(join(full, '.git')) };
        }),
      };
    });
  }

  /**
   * Resolves a subfolder by name across all parent folders, e.g.
   * `enrollbridge` → `~/workspace/products/enrollbridge`.
   */
  findChild(name: string): FolderEntry {
    const matches = this.browse().flatMap((parent) => parent.children.filter((child) => child.name === name.trim()));
    const [first, second] = matches;
    if (!first) {
      throw new NotFoundError(`No folder called “${name}” inside your parent folders.`, {
        hint: this.list().length ? 'List them with `soja folders list`.' : 'Add one with `soja folders add <path>`.',
      });
    }
    if (second) {
      throw new ConflictError(`“${name}” exists in more than one parent folder.`, {
        hint: `Use the full path: ${matches.map((match) => tildify(match.path)).join(' or ')}`,
      });
    }
    return first;
  }

  private find(pathOrName: string): string {
    const folders = this.list();
    const absolute = resolve(expandHome(pathOrName.trim()));
    if (folders.includes(absolute)) return absolute;
    const byName = folders.filter((folder) => basename(folder) === pathOrName.trim());
    if (byName.length === 1 && byName[0]) return byName[0];
    throw new NotFoundError(`${pathOrName} is not one of your parent folders.`, { hint: 'List them with `soja folders list`.' });
  }

  private save(parentFolders: string[]): void {
    const current = this.config.load();
    if (!current) {
      throw new SojaError('SOJA is not set up yet.', { hint: 'Run `soja` once to create your user and workspace.' });
    }
    this.config.save({ ...current, parentFolders });
  }
}

function isDirectory(parent: string, name: string, isDir: boolean, isLink: boolean): boolean {
  if (isDir) return true;
  if (!isLink) return false;
  try {
    return statSync(join(parent, name)).isDirectory();
  } catch {
    return false;
  }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
