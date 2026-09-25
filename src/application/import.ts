import type { Session } from './types.js';

/** What `soja import-local` would bring to the server. */
export interface ImportPreview {
  /** The local workspace the data comes from. */
  from: { name: string; slug: string };
  projects: number;
  tasks: number;
  comments: number;
  activity: number;
  /** Local developers (usernames) that will be matched with the server's members. */
  developers: string[];
  /** True when this local workspace was already imported into this server workspace. */
  alreadyImported: boolean;
}

export interface ImportOutcome {
  projects: number;
  tasks: number;
  comments: number;
  activity: number;
  /** Local number → server number, where they differ. */
  renumbered: Record<string, number>;
  unmatchedUsers: string[];
  /** Projects whose folder link on this machine was carried over. */
  linkedFolders: number;
}

/** Bringing local-mode data to the team (remote mode only). */
export interface ImportOperations {
  preview(session: Session, options?: { from?: string }): Promise<ImportPreview>;
  run(session: Session, options?: { from?: string }): Promise<ImportOutcome>;
}
