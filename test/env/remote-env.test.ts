import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { statSync, writeFileSync, chmodSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { ApiClient } from '../../src/data/remote/api-client.js';
import { RemoteEnvService } from '../../src/data/sync/env.js';
import { encryptValue, envelopeStatement, generateDevice, newVaultKey, sealVaultKey, signStatement, valueStatement } from '../../src/env/crypto.js';
import { EnvKeyStore } from '../../src/env/keystore.js';
import { tempDir } from '../helpers.js';
import { FakeEnvServer } from './fake-env-server.js';

let dir: ReturnType<typeof tempDir>;
let server: FakeEnvServer;
beforeEach(() => {
  dir = tempDir();
  server = new FakeEnvServer();
});
afterEach(() => dir.cleanup());

const SERVER = 'https://soja.test';
const project = randomUUID();

/** One person on one machine: their own key file, session and service. */
function person(username: string, role: 'owner' | 'member') {
  const { id, token } = server.addUser(username, role);
  const now = new Date();
  const session: Session = {
    user: { id, username, displayName: username, email: null, createdAt: now, updatedAt: now },
    workspace: { id: server.workspaceId, name: 'Bravos', slug: 'bravos', description: null, createdAt: now, updatedAt: now },
  };
  const keys = new EnvKeyStore(join(dir.path, `${username}-env-keys.json`));
  const env = new RemoteEnvService(new ApiClient(SERVER, token, server.fetch), keys, () => server.now);
  return { id, session, env, keys, file: join(dir.path, `${username}-env-keys.json`) };
}

async function ownerWithProduction() {
  const michael = person('michael', 'owner');
  await michael.env.setup('michael-laptop');
  const vault = await michael.env.createVault(michael.session, project, 'production');
  await michael.env.setVariable(michael.session, vault.id, 'DATABASE_URL', 'postgres://prod');
  await michael.env.setVariable(michael.session, vault.id, 'STRIPE_KEY', 'sk_live_123');
  return { michael, vault };
}

describe('the happy path', () => {
  it('an owner writes, a member with access loads exactly those values; the server only ever saw ciphertext', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    await angel.env.setup('angel-laptop');

    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow('No access');
    const granted = await michael.env.grant(michael.session, vault.id, angel.id, 7);
    expect(granted).toMatchObject({ sealedFor: 1, waitingFor: [] });
    expect(granted.expiresAt.getTime() - server.now.getTime()).toBe(7 * 86_400_000);

    const loaded = await angel.env.load(angel.session, vault.id);
    expect(loaded.variables).toEqual({ DATABASE_URL: 'postgres://prod', STRIPE_KEY: 'sk_live_123' });
    expect(loaded.environment).toBe('production');

    const stored = JSON.stringify([...server.vaults.values()].map((entry) => [...entry.variables.values(), ...entry.envelopes.values()]));
    expect(stored).not.toContain('postgres://prod');
    expect(stored).not.toContain('sk_live_123');
  });

  it('keeps private keys in a file only its owner can read, and closes it again if widened', async () => {
    const michael = person('michael', 'owner');
    await michael.env.setup('laptop');
    expect(statSync(michael.file).mode & 0o777).toBe(0o600);
    chmodSync(michael.file, 0o644);
    expect(michael.env.thisDevice()).not.toBeNull();
    expect(statSync(michael.file).mode & 0o777).toBe(0o600);
  });

  it('rotation re-encrypts every value for the devices that still have access and leaves the revoked member out', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    await angel.env.setup('angel-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 3);
    await michael.env.revoke(michael.session, vault.id, angel.id);
    expect((await michael.env.vaults(michael.session))[0]?.rotationRequired).toBe(true);

    const rotated = await michael.env.rotate(michael.session, vault.id);
    expect(rotated).toMatchObject({ keyVersion: 2, sealedFor: 1, blocked: [] });
    expect((await michael.env.load(michael.session, vault.id)).variables).toEqual({ DATABASE_URL: 'postgres://prod', STRIPE_KEY: 'sk_live_123' });
    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow();
  });
});

describe('a compromised server', () => {
  it('cannot inject a value: unsigned, signed by a member, or signed by a device of its own', async () => {
    const { michael, vault } = await ownerWithProduction();
    const stored = server.vaults.get(vault.id);
    if (!stored) throw new Error('vault missing');
    const original = stored.variables.get('DATABASE_URL');
    if (!original) throw new Error('variable missing');

    // Garbage signature.
    stored.variables.set('DATABASE_URL', { ...original, signature: original.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) });
    await expect(michael.env.load(michael.session, vault.id)).rejects.toThrow('signature on DATABASE_URL does not match');

    // A device the server planted, claiming to belong to an owner it invents.
    const intruderUser = server.addUser('intruder', 'owner');
    const intruderKeys = generateDevice();
    const planted = server.plantDevice(intruderUser.id, intruderKeys);
    // Without the vault key it cannot even produce a decryptable value; give it the benefit of the doubt anyway.
    const context = { workspaceId: server.workspaceId, vaultId: vault.id, environment: 'production' as const, keyVersion: 1 };
    const ciphertext = encryptValue(newVaultKey(), 'DATABASE_URL', 'postgres://attacker', context);
    stored.variables.set('DATABASE_URL', { ...original, ciphertext, signerDeviceKeyId: planted.id, signature: signStatement(valueStatement(context, 'DATABASE_URL', ciphertext), intruderKeys) });
    await expect(michael.env.load(michael.session, vault.id)).rejects.toThrow();
  });

  it('cannot move a value to another name, nor a production value into staging', async () => {
    const { michael, vault } = await ownerWithProduction();
    const stored = server.vaults.get(vault.id);
    const stripe = stored?.variables.get('STRIPE_KEY');
    if (!stored || !stripe) throw new Error('setup');
    stored.variables.set('DATABASE_URL', { ...stripe, name: 'DATABASE_URL' });
    await expect(michael.env.load(michael.session, vault.id)).rejects.toThrow('DATABASE_URL');

    stored.variables.set('DATABASE_URL', { ...stripe, name: 'DATABASE_URL' });
    stored.variables.delete('DATABASE_URL');
    stored.environment = 'staging';
    await expect(michael.env.load(michael.session, vault.id)).rejects.toThrow('signature');
  });

  it('cannot make a member accept a key it sealed and signed itself', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    await angel.env.setup('angel-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 7);
    await angel.env.load(angel.session, vault.id); // Angel has now seen (and pinned) Michael's laptop.

    // The server plants a second "Michael" device and re-seals a key of its choosing to Angel.
    const fake = generateDevice();
    const planted = server.plantDevice(michael.id, fake, 'michael-desktop');
    const stored = server.vaults.get(vault.id);
    const angelDevice = angel.env.thisDevice();
    if (!stored || !angelDevice) throw new Error('setup');
    const context = { workspaceId: server.workspaceId, vaultId: vault.id, environment: 'production' as const, keyVersion: 1 };
    const angelPublic = [...server.devices.values()].find((device) => device.id === angelDevice.id);
    if (!angelPublic) throw new Error('setup');
    const sealed = sealVaultKey(newVaultKey(), { id: angelDevice.id, encryptionKey: angelPublic.encryptionKey }, context);
    stored.envelopes.set(angelDevice.id, { deviceKeyId: angelDevice.id, sealed, signerDeviceKeyId: planted.id, signature: signStatement(envelopeStatement(context, angelDevice.id, sealed), fake), keyVersion: 1 });

    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow('has not seen before');
    // After a person compares fingerprints and confirms, it would be accepted — that is the only way in.
    const listed = await angel.env.devices(angel.session);
    expect(listed.find((device) => device.id === planted.id)?.trust).toBe('blocked');
  });

  it('cannot get production values sealed to a device it planted for a known member', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    await angel.env.setup('angel-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 7);

    const planted = server.plantDevice(angel.id, generateDevice(), 'angel-desktop');
    const shared = await michael.env.sharePending(michael.session, vault.id);
    expect(shared.sealed).toBe(0);
    expect(shared.blocked).toEqual([expect.stringContaining('@angel · angel-desktop')]);
    expect(server.vaults.get(vault.id)?.envelopes.has(planted.id)).toBe(false);

    // Once Michael confirms the fingerprint with Angel, it goes through.
    await michael.env.trust(michael.session, planted.id);
    expect((await michael.env.sharePending(michael.session, vault.id)).sealed).toBe(1);
  });

  it('cannot hand a member a production key signed by another member', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    const bruno = person('bruno', 'member');
    await angel.env.setup('angel-laptop');
    await bruno.env.setup('bruno-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 7);
    await michael.env.grant(michael.session, vault.id, bruno.id, 7);
    const brunoKeys = new EnvKeyStore(bruno.file).device(SERVER);
    const angelDevice = angel.env.thisDevice();
    const stored = server.vaults.get(vault.id);
    if (!brunoKeys || !angelDevice || !stored) throw new Error('setup');
    const angelPublic = server.devices.get(angelDevice.id);
    if (!angelPublic) throw new Error('setup');
    const context = { workspaceId: server.workspaceId, vaultId: vault.id, environment: 'production' as const, keyVersion: 1 };
    const sealed = sealVaultKey(newVaultKey(), { id: angelDevice.id, encryptionKey: angelPublic.encryptionKey }, context);
    stored.envelopes.set(angelDevice.id, { deviceKeyId: angelDevice.id, sealed, signerDeviceKeyId: brunoKeys.id, signature: signStatement(envelopeStatement(context, angelDevice.id, sealed), brunoKeys.secrets), keyVersion: 1 });
    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow('Production keys must be shared by an owner');
  });

  it('with a colluding member holding the key, cannot slip in a value signed by an owner it invented', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    const bruno = person('bruno', 'member');
    await angel.env.setup('angel-laptop');
    await bruno.env.setup('bruno-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 7);
    await michael.env.grant(michael.session, vault.id, bruno.id, 7);
    await angel.env.load(angel.session, vault.id); // First contact: Angel pins Michael's laptop.

    // Bruno leaks the vault key; the server invents an owner "laura" whose device the attackers control.
    const brunoKeys = new EnvKeyStore(bruno.file).device(SERVER);
    const stored = server.vaults.get(vault.id);
    const brunoEnvelope = brunoKeys ? stored?.envelopes.get(brunoKeys.id) : undefined;
    if (!brunoKeys || !stored || !brunoEnvelope) throw new Error('setup');
    const context = { workspaceId: server.workspaceId, vaultId: vault.id, environment: 'production' as const, keyVersion: 1 };
    const { openVaultKey } = await import('../../src/env/crypto.js');
    const leaked = openVaultKey(brunoEnvelope.sealed, { id: brunoKeys.id, secrets: brunoKeys.secrets }, context);
    const laura = server.addUser('laura', 'owner');
    const lauraKeys = generateDevice();
    const lauraDevice = server.plantDevice(laura.id, lauraKeys, 'laura-laptop');
    const ciphertext = encryptValue(leaked, 'DATABASE_URL', 'postgres://attacker', context);
    const original = stored.variables.get('DATABASE_URL');
    if (!original) throw new Error('setup');
    stored.variables.set('DATABASE_URL', { ...original, ciphertext, signerDeviceKeyId: lauraDevice.id, signature: signStatement(valueStatement(context, 'DATABASE_URL', ciphertext), lauraKeys) });

    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow('has not seen before');
    // Owners never take another owner on trust either.
    await expect(michael.env.load(michael.session, vault.id)).rejects.toThrow('has not seen before');
  });

  it('a changed key for a pinned device blocks until confirmed', async () => {
    const { michael, vault } = await ownerWithProduction();
    const angel = person('angel', 'member');
    await angel.env.setup('angel-laptop');
    await michael.env.grant(michael.session, vault.id, angel.id, 7);
    await angel.env.load(angel.session, vault.id);
    const michaelDevice = michael.env.thisDevice();
    if (!michaelDevice) throw new Error('setup');
    const record = server.devices.get(michaelDevice.id);
    if (!record) throw new Error('setup');
    record.signingKey = generateDevice().signingKey;
    await expect(angel.env.load(angel.session, vault.id)).rejects.toThrow('changed');
  });
});

describe('the key file', () => {
  it('refuses a corrupted file instead of guessing', () => {
    const file = join(dir.path, 'broken.json');
    writeFileSync(file, '{ not json', { mode: 0o600 });
    expect(() => new EnvKeyStore(file).device(SERVER)).toThrow('not valid JSON');
  });
});
