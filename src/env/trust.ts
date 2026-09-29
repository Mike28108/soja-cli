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

export type TrustDecision =
  | { kind: 'trusted'; role: 'owner' | 'member'; pinned: TrustedDevice | null }
  /** Never seen anyone of this person before: pinned now, trusted from here on (TOFU). */
  | { kind: 'first-use'; role: 'owner' | 'member'; pin: TrustedDevice }
  | { kind: 'blocked'; reason: 'key-changed' | 'new-device' | 'new-owner' | 'unknown-role'; device: ServerDevice; fingerprint: string };

/**
 * Whether to believe a device the server presents:
 * - this machine: yes, with your own role;
 * - a pinned device: only with exactly the pinned keys, and with the pinned role;
 * - an unpinned device of a person you already know (you included): blocked
 *   until someone compares fingerprints — the server could have added it;
 * - an owner never seen before: trusted on first use only at a member's very
 *   first contact with the workspace; otherwise blocked until confirmed;
 * - the first device you ever see of a member: pinned now (trust on first use).
 */
export function decideTrust(device: ServerDevice, pins: Record<string, TrustedDevice>, self: { device: ThisDevice; userId: string; role: 'owner' | 'member' }, now: Date): TrustDecision {
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
  const knownPerson = device.userId === self.userId || Object.values(pins).some((pin) => pin.userId === device.userId);
  if (knownPerson) return { kind: 'blocked', reason: 'new-device', device, fingerprint: printed };
  if (!device.role) return { kind: 'blocked', reason: 'unknown-role', device, fingerprint: printed };
  // Owners sign values, so an owner is only taken on trust at a member's very first contact
  // with the workspace. Later, a server (with a colluding member) could otherwise invent one.
  const firstContact = self.role === 'member' && Object.keys(pins).length === 0;
  if (device.role === 'owner' && !firstContact) return { kind: 'blocked', reason: 'new-owner', device, fingerprint: printed };
  return {
    kind: 'first-use',
    role: device.role,
    pin: {
      userId: device.userId,
      username: device.username ?? device.userId,
      role: device.role,
      label: device.label,
      encryptionKey: device.encryptionKey,
      signingKey: device.signingKey,
      fingerprint: printed,
      trustedAt: now.toISOString(),
      how: 'first-use',
    },
  };
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
