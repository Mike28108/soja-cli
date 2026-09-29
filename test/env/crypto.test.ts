import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptValue,
  encryptValue,
  EnvCryptoError,
  envelopeStatement,
  fingerprint,
  generateDevice,
  newVaultKey,
  openVaultKey,
  sealVaultKey,
  signStatement,
  valueStatement,
  verifyStatement,
  type VaultContext,
} from '../../src/env/crypto.js';

const context: VaultContext = { workspaceId: randomUUID(), vaultId: randomUUID(), environment: 'production', keyVersion: 1 };
const device = () => ({ id: randomUUID(), secrets: generateDevice() });
/** Flips one bit of a base64url string's bytes. */
function tamper(text: string, at: number): string {
  const bytes = Buffer.from(text, 'base64url');
  bytes[at] = (bytes[at] ?? 0) ^ 0x01;
  return bytes.toString('base64url');
}

describe('device keys', () => {
  it('have 32-byte public keys and a stable fingerprint in groups of four', () => {
    const { secrets } = device();
    expect(Buffer.from(secrets.encryptionKey, 'base64url')).toHaveLength(32);
    expect(Buffer.from(secrets.signingKey, 'base64url')).toHaveLength(32);
    const printed = fingerprint(secrets);
    expect(printed).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){7}$/);
    expect(fingerprint(secrets)).toBe(printed);
    expect(fingerprint(generateDevice())).not.toBe(printed);
  });
});

describe('sealing vault keys', () => {
  it('opens only on the device it was sealed for, in the exact place it was sealed', () => {
    const alice = device();
    const bob = device();
    const key = newVaultKey();
    const sealed = sealVaultKey(key, { id: alice.id, encryptionKey: alice.secrets.encryptionKey }, context);
    expect(Buffer.from(sealed, 'base64url')).toHaveLength(93);
    expect(openVaultKey(sealed, alice, context).equals(key)).toBe(true);

    expect(() => openVaultKey(sealed, bob, context)).toThrow(EnvCryptoError);
    // The server cannot reuse an envelope for another vault, key version or device id.
    expect(() => openVaultKey(sealed, alice, { ...context, vaultId: randomUUID() })).toThrow(EnvCryptoError);
    expect(() => openVaultKey(sealed, alice, { ...context, workspaceId: randomUUID() })).toThrow(EnvCryptoError);
    expect(() => openVaultKey(sealed, alice, { ...context, keyVersion: 2 })).toThrow(EnvCryptoError);
    expect(() => openVaultKey(sealed, { ...alice, id: randomUUID() }, context)).toThrow(EnvCryptoError);
  });

  it('rejects any altered byte, a wrong size or an unknown version', () => {
    const alice = device();
    const sealed = sealVaultKey(newVaultKey(), { id: alice.id, encryptionKey: alice.secrets.encryptionKey }, context);
    for (const at of [0, 1, 20, 40, 60, 92]) expect(() => openVaultKey(tamper(sealed, at), alice, context)).toThrow(EnvCryptoError);
    expect(() => openVaultKey(sealed.slice(0, -4), alice, context)).toThrow(EnvCryptoError);
    expect(() => openVaultKey('not base64!', alice, context)).toThrow(EnvCryptoError);
  });

  it('uses a fresh ephemeral key every time', () => {
    const alice = device();
    const key = newVaultKey();
    const recipient = { id: alice.id, encryptionKey: alice.secrets.encryptionKey };
    expect(sealVaultKey(key, recipient, context)).not.toBe(sealVaultKey(key, recipient, context));
  });
});

describe('values', () => {
  it('round-trip, including unicode and empty values', () => {
    const key = newVaultKey();
    for (const value of ['postgres://user:pa$$@db:5432/app', 'ñandú ☕', '', 'x'.repeat(32 * 1024)]) {
      expect(decryptValue(key, 'DATABASE_URL', encryptValue(key, 'DATABASE_URL', value, context), context)).toBe(value);
    }
    expect(() => encryptValue(key, 'BIG', 'x'.repeat(32 * 1024 + 1), context)).toThrow(EnvCryptoError);
  });

  it('cannot be moved to another name, vault, workspace or key version, nor altered', () => {
    const key = newVaultKey();
    const ciphertext = encryptValue(key, 'STRIPE_KEY', 'sk_live_123', context);
    expect(() => decryptValue(key, 'DATABASE_URL', ciphertext, context)).toThrow(EnvCryptoError);
    expect(() => decryptValue(key, 'STRIPE_KEY', ciphertext, { ...context, vaultId: randomUUID() })).toThrow(EnvCryptoError);
    expect(() => decryptValue(key, 'STRIPE_KEY', ciphertext, { ...context, workspaceId: randomUUID() })).toThrow(EnvCryptoError);
    expect(() => decryptValue(key, 'STRIPE_KEY', ciphertext, { ...context, keyVersion: 2 })).toThrow(EnvCryptoError);
    expect(() => decryptValue(newVaultKey(), 'STRIPE_KEY', ciphertext, context)).toThrow(EnvCryptoError);
    expect(() => decryptValue(key, 'STRIPE_KEY', tamper(ciphertext, 15), context)).toThrow(EnvCryptoError);
    expect(() => decryptValue(key, 'STRIPE_KEY', 'AQ', context)).toThrow(EnvCryptoError);
  });
});

describe('signatures', () => {
  it('verify only the exact statement, with the signer’s key', () => {
    const owner = generateDevice();
    const intruder = generateDevice();
    const statement = valueStatement(context, 'STRIPE_KEY', 'ciphertext');
    const signature = signStatement(statement, owner);
    expect(verifyStatement(statement, signature, owner.signingKey)).toBe(true);
    expect(verifyStatement(statement, signature, intruder.signingKey)).toBe(false);
    expect(verifyStatement(statement, signStatement(statement, intruder), owner.signingKey)).toBe(false);
    // Same value presented for staging, another name or another ciphertext.
    expect(verifyStatement(valueStatement({ ...context, environment: 'staging' }, 'STRIPE_KEY', 'ciphertext'), signature, owner.signingKey)).toBe(false);
    expect(verifyStatement(valueStatement(context, 'OTHER', 'ciphertext'), signature, owner.signingKey)).toBe(false);
    expect(verifyStatement(valueStatement(context, 'STRIPE_KEY', 'ciphertexT'), signature, owner.signingKey)).toBe(false);
    // An envelope statement never passes for a value statement.
    expect(verifyStatement(envelopeStatement(context, 'STRIPE_KEY', 'ciphertext'), signature, owner.signingKey)).toBe(false);
    expect(verifyStatement(statement, 'garbage', owner.signingKey)).toBe(false);
    expect(verifyStatement(statement, signature, 'short')).toBe(false);
  });
});
