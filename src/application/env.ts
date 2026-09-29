import type { Session } from './types.js';

/** Shared, end-to-end encrypted environment variables (remote mode only). See docs/SOJA.md §9. */

export type EnvEnvironment = 'development' | 'staging' | 'production';
export const ENV_ENVIRONMENTS: readonly EnvEnvironment[] = ['development', 'staging', 'production'];
export const GRANT_DAYS = [3, 7, 30] as const;
export type GrantDays = (typeof GRANT_DAYS)[number];

export interface EnvDeviceView {
  id: string;
  userId: string;
  username: string;
  role: 'owner' | 'member';
  label: string;
  fingerprint: string;
  /** `this`: this machine. `pinned`: seen before with the same keys. `new`: never seen (trusted on first use). `blocked`: needs confirming. */
  trust: 'this' | 'pinned' | 'confirmed' | 'new' | 'blocked';
}

export interface EnvVaultView {
  id: string;
  projectId: string;
  environment: EnvEnvironment;
  keyVersion: number;
  variables: number;
  canRead: boolean;
  canShare: boolean;
  canWrite: boolean;
  /** Your access ends then (members); null for owners. */
  expiresAt: Date | null;
  /** Owners: someone lost access since the last rotation. */
  rotationRequired: boolean;
  pendingDevices: { id: string; username: string | null; label: string }[];
  grants: { userId: string; username: string; expiresAt: Date }[];
}

export interface LoadedVault {
  vaultId: string;
  projectId: string;
  environment: EnvEnvironment;
  variables: Record<string, string>;
  expiresAt: Date | null;
}

export interface EnvHistoryEntry {
  action: string;
  actor: string | null;
  subject: string | null;
  detail: string | null;
  createdAt: Date;
}

export interface EnvOperations {
  /** This machine as a device of yours on this server, or null before `setup`. */
  thisDevice(): { id: string; label: string; fingerprint: string } | null;
  /** Registers this machine (keys generated here, private halves never leave it). Idempotent. */
  setup(label: string): Promise<{ id: string; label: string; fingerprint: string }>;
  devices(session: Session): Promise<EnvDeviceView[]>;
  /** After comparing fingerprints with its owner, trust a blocked or new device. */
  trust(session: Session, deviceId: string): Promise<EnvDeviceView>;
  removeDevice(deviceId: string): Promise<void>;

  vaults(session: Session, projectId?: string): Promise<EnvVaultView[]>;
  createVault(session: Session, projectId: string, environment: EnvEnvironment): Promise<EnvVaultView>;
  /** Names only: values are never listed. */
  names(session: Session, vaultId: string): Promise<{ name: string; updatedAt: Date }[]>;
  setVariable(session: Session, vaultId: string, name: string, value: string): Promise<void>;
  removeVariable(session: Session, vaultId: string, name: string): Promise<void>;
  grant(session: Session, vaultId: string, userId: string, days: GrantDays): Promise<{ expiresAt: Date; sealedFor: number; waitingFor: string[] }>;
  revoke(session: Session, vaultId: string, userId: string): Promise<void>;
  /** Seals the key for devices that have access but no copy yet. Returns how many, and who still needs confirming. */
  sharePending(session: Session, vaultId: string): Promise<{ sealed: number; blocked: string[] }>;
  rotate(session: Session, vaultId: string): Promise<{ keyVersion: number; sealedFor: number; blocked: string[] }>;
  history(session: Session, vaultId: string): Promise<EnvHistoryEntry[]>;

  /** Decrypts a vault in memory after verifying every signature. Only the agent calls this. */
  load(session: Session, vaultId: string): Promise<LoadedVault>;
}
