import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NotFoundError, ValidationError } from '../../domain/errors.js';

/** The database SOJA is using now: the local one, or the remote-mode replica. */
export interface BackupSource {
  /** Short name for the files, e.g. `local` or the server host. */
  label: string;
  backupTo(file: string): void;
}

export interface Backup {
  name: string;
  path: string;
  createdAt: Date;
  bytes: number;
  kind: 'auto' | 'manual' | 'before-restore';
}

const AUTO_EVERY_MS = 24 * 60 * 60 * 1000;
const AUTO_KEEP = 7;
const NAME = /^soja-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?)-(auto|manual|before-restore)\.db$/;

/**
 * Copies of the database SOJA is using. In remote mode that is the replica,
 * which matters for the changes still waiting to be sent.
 */
export class BackupService {
  constructor(
    private readonly source: BackupSource,
    private readonly dir: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  create(kind: 'auto' | 'manual' = 'manual'): Backup {
    mkdirSync(this.dir, { recursive: true });
    const path = join(this.dir, fileName(this.source.label, this.clock(), kind));
    this.source.backupTo(path);
    return describe(path);
  }

  /** Newest first, only this database's copies. */
  list(): Backup[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((name) => NAME.exec(name)?.[1] === safeLabel(this.source.label))
      .map((name) => describe(join(this.dir, name)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** A daily copy when SOJA opens; keeps the last seven. Returns the copy made, if any. */
  auto(): Backup | null {
    const autos = this.list().filter((backup) => backup.kind === 'auto');
    const latest = autos[0];
    if (latest && this.clock().getTime() - latest.createdAt.getTime() < AUTO_EVERY_MS) return null;
    const made = this.create('auto');
    for (const old of [made, ...autos].slice(AUTO_KEEP)) rmSync(old.path, { force: true });
    return made;
  }

  find(name: string): Backup {
    const backup = this.list().find((candidate) => candidate.name === name || candidate.name === `${name}.db`);
    if (!backup) throw new NotFoundError(`There is no backup called ${name}.`, { hint: 'See them with `soja backup list`.' });
    return backup;
  }
}

/**
 * Puts a backup in place of `databaseFile`, keeping a copy of the current
 * state first. SOJA must not have the database open (run it from a command
 * that did not open one).
 */
export function restoreBackup(backup: Backup, databaseFile: string, dir: string, label: string, clock: () => Date = () => new Date()): Backup | null {
  if (!existsSync(backup.path)) throw new ValidationError(`${backup.name} no longer exists.`);
  let saved: Backup | null = null;
  if (existsSync(databaseFile)) {
    const path = join(dir, fileName(label, clock(), 'before-restore'));
    copyFileSync(databaseFile, path);
    saved = describe(path);
  }
  // The write-ahead log belongs to the database being replaced.
  for (const suffix of ['-wal', '-shm']) rmSync(`${databaseFile}${suffix}`, { force: true });
  mkdirSync(join(databaseFile, '..'), { recursive: true });
  copyFileSync(backup.path, databaseFile);
  return saved;
}

function fileName(label: string, at: Date, kind: Backup['kind']): string {
  return `soja-${safeLabel(label)}-${at.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')}-${kind}.db`;
}

function safeLabel(label: string): string {
  return label.replace(/[^a-z0-9.]+/gi, '_');
}

function describe(path: string): Backup {
  const name = basename(path);
  const match = NAME.exec(name);
  const stamp = match?.[2] ?? '';
  const [date = '', time = ''] = stamp.split('T');
  const [hours = '00', minutes = '00', seconds = '00', millis = '000'] = time.split('-');
  return {
    name,
    path,
    createdAt: new Date(`${date}T${hours}:${minutes}:${seconds}.${millis}Z`),
    bytes: statSync(path).size,
    kind: (match?.[3] as Backup['kind'] | undefined) ?? 'manual',
  };
}
