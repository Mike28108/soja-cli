import { fingerprint } from './crypto.js';
import type { ThisDevice, TrustedDevice } from './keystore.js';

/** A device as the server describes it. Everything here is a claim until checked against the pins. */
export interface ServerDevice {
  id: string;
  userId: string;
  username: string | null;
  role: 'owner' | 'member' | null;
  label: string;
  encryptionKey: string;
  signingKey: string;
}

/**
 * What a device may be taken on trust for, the first time it is seen:
 * - `pinned-only`: nothing — only this machine and devices already pinned;
 * - `bootstrap`: an owner, at this machine's very first contact with the workspace;
 * - `chosen-member`: a member you just picked yourself (giving them access).
 */
export type FirstUse = 'pinned-only' | 'bootstrap' | 'chosen-member';

export type TrustDecision =
  | { kind: 'trusted'; role: 'owner' | 'member'; pinned: TrustedDevice | null }
  /** Pinned now (trust on first use), within what `FirstUse` allowed. */
  | { kind: 'first-use'; role: 'owner' | 'member'; pin: TrustedDevice }
  | { kind: 'blocked'; reason: 'key-changed' | 'new-device' | 'not-confirmed'; device: ServerDevice; fingerprint: string };

export interface Self {
  device: ThisDevice;
  userId: string;
  role: 'owner' | 'member';
  /** This machine already worked with the workspace: no more trust on first use of owners. */
  introduced: boolean;
}

/**
 * Whether to believe a device the server presents. The server decides nothing
 * here: roles and first sight only count where `firstUse` allows, and a pinned
 * device keeps the keys and role it was pinned with.
 */
export function decideTrust(device: ServerDevice, pins: Record<string, TrustedDevice>, self: Self, now: Date, firstUse: FirstUse): TrustDecision {
  const printed = fingerprint(device);
  if (device.id === self.device.id) {
    const same = device.encryptionKey === self.device.secrets.encryptionKey && device.signingKey === self.device.secrets.signingKey;
    return same ? { kind: 'trusted', role: self.role, pinned: null } : { kind: 'blocked', reason: 'key-changed', device, fingerprint: printed };
  }
  const pinned = pins[device.id];
  if (pinned) {
    const same = pinned.encryptionKey === device.encryptionKey && pinned.signingKey === device.signingKey && pinned.userId === device.userId;
    return same ? { kind: 'trusted', role: pinned.role, pinned } : { kind: 'blocked', reason: 'key-changed', device, fingerprint: printed };
  }
  // A new device of someone already known (you included) could be the server's own.
  const knownPerson = device.userId === self.userId || Object.values(pins).some((pin) => pin.userId === device.userId);
  if (knownPerson) return { kind: 'blocked', reason: 'new-device', device, fingerprint: printed };
  const pin = (role: 'owner' | 'member'): TrustDecision => ({
    kind: 'first-use',
    role,
    pin: { userId: device.userId, username: device.username ?? device.userId, role, label: device.label, encryptionKey: device.encryptionKey, signingKey: device.signingKey, fingerprint: printed, trustedAt: now.toISOString(), how: 'first-use' },
  });
  if (firstUse === 'bootstrap' && !self.introduced && Object.keys(pins).length === 0 && device.role === 'owner') return pin('owner');
  if (firstUse === 'chosen-member' && device.role === 'member') return pin('member');
  return { kind: 'blocked', reason: 'not-confirmed', device, fingerprint: printed };
}

/** The pin a person writes after comparing fingerprints (`soja env trust`). */
export function confirmedPin(device: ServerDevice, now: Date): TrustedDevice {
  if (!device.role) throw new Error('A device without a workspace role cannot be trusted.');
  return {
    userId: device.userId,
    username: device.username ?? device.userId,
    role: device.role,
    label: device.label,
    encryptionKey: device.encryptionKey,
    signingKey: device.signingKey,
    fingerprint: fingerprint(device),
    trustedAt: now.toISOString(),
    how: 'confirmed',
  };
}
