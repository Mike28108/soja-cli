import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

/*
 * The cryptography of shared environment variables, exactly as specified in
 * soja-backend docs/ENV.md. Only Node's built-in crypto: X25519 to seal vault
 * keys to devices, Ed25519 to sign, HKDF-SHA256 and AES-256-GCM.
 *
 * Every function that opens or verifies something throws EnvCryptoError on
 * any mismatch; callers never get a partially trusted result.
 */

export class EnvCryptoError extends Error {}

const VERSION = 0x01;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const SEALED_BYTES = 1 + KEY_BYTES + NONCE_BYTES + KEY_BYTES + TAG_BYTES;
export const MAX_VALUE_BYTES = 32 * 1024;

/** A device's private half, as stored on this machine only. */
export interface DeviceSecrets {
  /** PKCS#8 DER, base64url. */
  encryptionPrivateKey: string;
  signingPrivateKey: string;
  encryptionKey: string;
  signingKey: string;
}

export interface DevicePublicKeys {
  encryptionKey: string;
  signingKey: string;
}

/** Where a piece of secret material belongs: binding it here stops the server from moving it. */
export interface VaultContext {
  workspaceId: string;
  vaultId: string;
  environment: 'development' | 'staging' | 'production';
  keyVersion: number;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
function unb64(text: string, expected?: number): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new EnvCryptoError('Malformed key material.');
  const bytes = Buffer.from(text, 'base64url');
  if (expected !== undefined && bytes.length !== expected) throw new EnvCryptoError('Key material has the wrong size.');
  return bytes;
}

function rawPublic(key: KeyObject): string {
  const x = key.export({ format: 'jwk' }).x;
  if (!x) throw new EnvCryptoError('Could not export a public key.');
  return x;
}

const publicX25519 = (key: string) => createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64(unb64(key, KEY_BYTES)) }, format: 'jwk' });
const publicEd25519 = (key: string) => createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b64(unb64(key, KEY_BYTES)) }, format: 'jwk' });
const privateKey = (der: string) => createPrivateKey({ key: unb64(der), format: 'der', type: 'pkcs8' });

export function generateDevice(): DeviceSecrets {
  const encryption = generateKeyPairSync('x25519');
  const signing = generateKeyPairSync('ed25519');
  return {
    encryptionPrivateKey: b64(encryption.privateKey.export({ format: 'der', type: 'pkcs8' })),
    signingPrivateKey: b64(signing.privateKey.export({ format: 'der', type: 'pkcs8' })),
    encryptionKey: rawPublic(encryption.publicKey),
    signingKey: rawPublic(signing.publicKey),
  };
}

/** `3F2A 91C0 …`: what two people compare to know a device is who it claims. */
export function fingerprint(device: DevicePublicKeys): string {
  const digest = createHash('sha256')
    .update('soja-device-v1')
    .update(unb64(device.encryptionKey, KEY_BYTES))
    .update(unb64(device.signingKey, KEY_BYTES))
    .digest()
    .subarray(0, 16)
    .toString('hex')
    .toUpperCase();
  return digest.match(/.{4}/g)?.join(' ') ?? digest;
}

export const newVaultKey = (): Buffer => randomBytes(KEY_BYTES);

// ── Sealing a vault key to a device ─────────────────────────────────────

const sealAad = (context: VaultContext, deviceKeyId: string) =>
  Buffer.from(`soja-env-seal-v1|${context.workspaceId}|${context.vaultId}|${context.keyVersion}|${deviceKeyId}`);

function kek(shared: Buffer, ephemeral: Buffer, recipient: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, Buffer.concat([ephemeral, recipient]), 'soja-env-seal-v1', KEY_BYTES));
}

export function sealVaultKey(vaultKey: Buffer, recipient: { id: string; encryptionKey: string }, context: VaultContext): string {
  if (vaultKey.length !== KEY_BYTES) throw new EnvCryptoError('A vault key has 32 bytes.');
  const ephemeral = generateKeyPairSync('x25519');
  const ephemeralPublic = unb64(rawPublic(ephemeral.publicKey), KEY_BYTES);
  const recipientPublic = unb64(recipient.encryptionKey, KEY_BYTES);
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: publicX25519(recipient.encryptionKey) });
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', kek(shared, ephemeralPublic, recipientPublic), nonce);
  cipher.setAAD(sealAad(context, recipient.id));
  const sealed = Buffer.concat([cipher.update(vaultKey), cipher.final()]);
  return b64(Buffer.concat([Buffer.from([VERSION]), ephemeralPublic, nonce, sealed, cipher.getAuthTag()]));
}

export function openVaultKey(sealed: string, device: { id: string; secrets: DeviceSecrets }, context: VaultContext): Buffer {
  const bytes = unb64(sealed, SEALED_BYTES);
  if (bytes[0] !== VERSION) throw new EnvCryptoError('Unknown envelope version.');
  const ephemeralPublic = bytes.subarray(1, 1 + KEY_BYTES);
  const nonce = bytes.subarray(1 + KEY_BYTES, 1 + KEY_BYTES + NONCE_BYTES);
  const body = bytes.subarray(1 + KEY_BYTES + NONCE_BYTES, SEALED_BYTES - TAG_BYTES);
  const tag = bytes.subarray(SEALED_BYTES - TAG_BYTES);
  try {
    const shared = diffieHellman({ privateKey: privateKey(device.secrets.encryptionPrivateKey), publicKey: publicX25519(b64(ephemeralPublic)) });
    const decipher = createDecipheriv('aes-256-gcm', kek(shared, ephemeralPublic, unb64(device.secrets.encryptionKey, KEY_BYTES)), nonce);
    decipher.setAAD(sealAad(context, device.id));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new EnvCryptoError('This envelope was not sealed for this device, or was altered.');
  }
}

// ── Values ─────────────────────────────────────────────────────────────

const valueAad = (context: VaultContext, name: string) =>
  Buffer.from(`soja-env-value-v1|${context.workspaceId}|${context.vaultId}|${context.keyVersion}|${name}`);

export function encryptValue(vaultKey: Buffer, name: string, value: string, context: VaultContext): string {
  const plain = Buffer.from(value, 'utf8');
  if (plain.length > MAX_VALUE_BYTES) throw new EnvCryptoError('A value can have at most 32 KiB.');
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', vaultKey, nonce);
  cipher.setAAD(valueAad(context, name));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return b64(Buffer.concat([Buffer.from([VERSION]), nonce, body, cipher.getAuthTag()]));
}

export function decryptValue(vaultKey: Buffer, name: string, ciphertext: string, context: VaultContext): string {
  const bytes = unb64(ciphertext);
  if (bytes.length < 1 + NONCE_BYTES + TAG_BYTES || bytes[0] !== VERSION) throw new EnvCryptoError(`${name} is malformed.`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', vaultKey, bytes.subarray(1, 1 + NONCE_BYTES));
    decipher.setAAD(valueAad(context, name));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([decipher.update(bytes.subarray(1 + NONCE_BYTES, bytes.length - TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    throw new EnvCryptoError(`${name} does not belong to this vault or was altered.`);
  }
}

// ── Signatures ─────────────────────────────────────────────────────────

export function envelopeStatement(context: VaultContext, deviceKeyId: string, sealed: string): Buffer {
  return Buffer.from(['soja-env-envelope-v1', context.workspaceId, context.vaultId, context.environment, String(context.keyVersion), deviceKeyId, sealed].join('\n'));
}

export function valueStatement(context: VaultContext, name: string, ciphertext: string): Buffer {
  return Buffer.from(['soja-env-value-v1', context.workspaceId, context.vaultId, context.environment, String(context.keyVersion), name, ciphertext].join('\n'));
}

export function signStatement(statement: Buffer, secrets: DeviceSecrets): string {
  return b64(sign(null, statement, privateKey(secrets.signingPrivateKey)));
}

export function verifyStatement(statement: Buffer, signature: string, signingKey: string): boolean {
  try {
    return verify(null, statement, publicEd25519(signingKey), unb64(signature, 64));
  } catch {
    return false;
  }
}
