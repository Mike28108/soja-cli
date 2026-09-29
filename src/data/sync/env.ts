import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { EnvDeviceView, EnvEnvironment, EnvHistoryEntry, EnvOperations, EnvVaultView, GrantDays, LoadedVault } from '../../application/env.js';
import type { Session } from '../../application/types.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import {
  decryptValue,
  encryptValue,
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
} from '../../env/crypto.js';
import type { EnvKeyStore, ThisDevice, TrustedDevice } from '../../env/keystore.js';
import { confirmedPin, decideTrust, type ServerDevice, type TrustDecision } from '../../env/trust.js';
import { terminalSafe } from '../../utils/text.js';
import type { ApiClient } from '../remote/api-client.js';

const NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;

/** Names and labels come from the server and end up in a terminal: no control sequences. */
function safeDevice<T extends { username: string | null; label: string }>(device: T): T {
  return { ...device, username: device.username === null ? null : terminalSafe(device.username), label: terminalSafe(device.label) };
}

interface VaultRow {
  id: string;
  projectId: string;
  environment: EnvEnvironment;
  keyVersion: number;
  variables: number;
  names?: { name: string; updatedAt: string }[];
  access: { canRead: boolean; canShare: boolean; canWrite: boolean; expiresAt: string | null };
  rotationRequired?: boolean;
  pendingDevices?: (ServerDevice & { username: string | null })[];
  grants?: { userId: string; username: string; expiresAt: string }[];
}

interface Material {
  vault: { id: string; projectId: string; environment: EnvEnvironment; keyVersion: number };
  access: { expiresAt: string | null };
  envelope: { keyVersion: number; sealed: string; signerDeviceKeyId: string; signature: string };
  variables: { name: string; keyVersion: number; ciphertext: string; signerDeviceKeyId: string; signature: string; updatedAt: string }[];
  signers: ServerDevice[];
}

interface Envelope {
  deviceKeyId: string;
  sealed: string;
  signerDeviceKeyId: string;
  signature: string;
}

/** Who you are here and whom you trust: everything a decision needs. */
interface TrustContext {
  device: ThisDevice;
  userId: string;
  role: 'owner' | 'member';
  pins: Record<string, TrustedDevice>;
}

/**
 * Environment variables over the SOJA API. The server only ever sees public
 * keys, sealed keys, ciphertext and signatures (soja-backend docs/ENV.md).
 */
export class RemoteEnvService implements EnvOperations {
  constructor(
    private readonly api: ApiClient,
    private readonly keys: EnvKeyStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  thisDevice() {
    const device = this.keys.device(this.api.baseUrl);
    return device ? { id: device.id, label: device.label, fingerprint: fingerprint(device.secrets) } : null;
  }

  async setup(label: string) {
    const existing = this.keys.device(this.api.baseUrl);
    if (existing) {
      const { devices } = await this.api.get<{ devices: { id: string; revokedAt: string | null }[] }>('/v1/devices');
      if (devices.some((device) => device.id === existing.id && !device.revokedAt)) return this.thisDevice() ?? unreachable();
    }
    const secrets = generateDevice();
    const name = label.trim() || hostname();
    const { device } = await this.api.post<{ device: { id: string } }>('/v1/devices', { label: name, encryptionKey: secrets.encryptionKey, signingKey: secrets.signingKey });
    this.keys.saveDevice(this.api.baseUrl, { id: device.id, label: name, secrets });
    return { id: device.id, label: name, fingerprint: fingerprint(secrets) };
  }

  async devices(session: Session): Promise<EnvDeviceView[]> {
    const context = await this.trustContext(session);
    return (await this.serverDevices(session)).map((device) => this.view(device, context));
  }

  async trust(session: Session, deviceId: string): Promise<EnvDeviceView> {
    const context = await this.trustContext(session);
    const device = (await this.serverDevices(session)).find((candidate) => candidate.id === deviceId);
    if (!device) throw new ValidationError('No active device with that id in this workspace.', { hint: 'List them with `soja env devices`.' });
    if (device.id === context.device.id) throw new ValidationError('This is your own device: it is always trusted.');
    this.keys.trust(this.api.baseUrl, session.workspace.id, device.id, confirmedPin(device, this.clock()));
    return this.view(device, await this.trustContext(session));
  }

  async removeDevice(deviceId: string): Promise<void> {
    await this.api.delete(`/v1/devices/${encodeURIComponent(deviceId)}`);
    if (this.keys.device(this.api.baseUrl)?.id === deviceId) this.keys.forgetDevice(this.api.baseUrl);
  }

  async vaults(session: Session, projectId?: string): Promise<EnvVaultView[]> {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const { vaults } = await this.api.get<{ vaults: VaultRow[] }>(`${this.base(session)}/vaults${query}`);
    return vaults.map(toView);
  }

  async createVault(session: Session, projectId: string, environment: EnvEnvironment): Promise<EnvVaultView> {
    const context = await this.trustContext(session);
    requireOwner(context, 'create environment variables');
    // The id is chosen here: every envelope is bound to it before the server sees anything.
    const vault: VaultContext = { workspaceId: session.workspace.id, vaultId: randomUUID(), environment, keyVersion: 1 };
    const owners = (await this.serverDevices(session)).filter((device) => device.role === 'owner');
    const { envelopes, newPins } = this.sealForAll(newVaultKey(), owners, vault, context);
    await this.api.post(`${this.base(session)}/vaults`, { id: vault.vaultId, projectId, environment, envelopes });
    this.savePins(session, newPins);
    const created = (await this.vaults(session, projectId)).find((row) => row.id === vault.vaultId);
    if (!created) throw new SojaError('The server did not keep the new environment.');
    return created;
  }

  /** From the vault list: names are not secret material, and reading them is not a fetch. */
  async names(session: Session, vaultId: string) {
    const vault = (await this.vaults(session)).find((candidate) => candidate.id === vaultId);
    if (!vault) throw new ValidationError('No such environment in this workspace.');
    return vault.names;
  }

  async setVariable(session: Session, vaultId: string, name: string, value: string): Promise<void> {
    const context = await this.trustContext(session);
    requireOwner(context, 'write environment variables');
    const material = await this.material(session, vaultId);
    const { key, vault, pins } = this.openKey(session, material, context);
    const ciphertext = encryptValue(key, name, value, vault);
    const signature = signStatement(valueStatement(vault, name, ciphertext), context.device.secrets);
    await this.api.request('PUT', `${this.base(session)}/vaults/${vaultId}/variables/${encodeURIComponent(name)}`, { keyVersion: vault.keyVersion, ciphertext, signerDeviceKeyId: context.device.id, signature });
    this.savePins(session, pins);
  }

  async removeVariable(session: Session, vaultId: string, name: string): Promise<void> {
    await this.api.delete(`${this.base(session)}/vaults/${vaultId}/variables/${encodeURIComponent(name)}`);
  }

  async grant(session: Session, vaultId: string, userId: string, days: GrantDays) {
    const context = await this.trustContext(session);
    const material = await this.material(session, vaultId);
    const { key, vault, pins } = this.openKey(session, material, context);
    const theirs = (await this.serverDevices(session)).filter((device) => device.userId === userId);
    const { envelopes, blocked, newPins } = this.sealForAll(key, theirs, vault, { ...context, pins: { ...context.pins, ...pins } });
    const { grant } = await this.api.post<{ grant: { expiresAt: string } }>(`${this.base(session)}/vaults/${vaultId}/grants`, { userId, days, keyVersion: vault.keyVersion, envelopes });
    this.savePins(session, { ...pins, ...newPins });
    return { expiresAt: new Date(grant.expiresAt), sealedFor: envelopes.length, waitingFor: blocked };
  }

  async revoke(session: Session, vaultId: string, userId: string): Promise<void> {
    await this.api.delete(`${this.base(session)}/vaults/${vaultId}/grants/${encodeURIComponent(userId)}`);
  }

  async sharePending(session: Session, vaultId: string) {
    const context = await this.trustContext(session);
    const row = (await this.api.get<{ vaults: VaultRow[] }>(`${this.base(session)}/vaults`)).vaults.find((vault) => vault.id === vaultId);
    if (!row) throw new ValidationError('No such environment in this workspace.');
    const pending = new Set((row.pendingDevices ?? []).map((device) => device.id));
    if (!pending.size) return { sealed: 0, blocked: [] };
    const material = await this.material(session, vaultId);
    const { key, vault, pins } = this.openKey(session, material, context);
    const targets = (await this.serverDevices(session)).filter((device) => pending.has(device.id));
    const { envelopes, blocked, newPins } = this.sealForAll(key, targets, vault, { ...context, pins: { ...context.pins, ...pins } });
    if (envelopes.length) await this.api.post(`${this.base(session)}/vaults/${vaultId}/envelopes`, { keyVersion: vault.keyVersion, envelopes });
    this.savePins(session, { ...pins, ...newPins });
    return { sealed: envelopes.length, blocked };
  }

  async rotate(session: Session, vaultId: string) {
    const context = await this.trustContext(session);
    requireOwner(context, 'rotate environment keys');
    const material = await this.material(session, vaultId);
    const { key: oldKey, vault, pins } = this.openKey(session, material, context);
    const values = this.decryptAll(material, oldKey, vault, { ...context, pins: { ...context.pins, ...pins } });
    const row = (await this.api.get<{ vaults: VaultRow[] }>(`${this.base(session)}/vaults`)).vaults.find((candidate) => candidate.id === vaultId);
    const grantees = new Set((row?.grants ?? []).map((grant) => grant.userId));
    const holders = (await this.serverDevices(session)).filter((device) => device.role === 'owner' || grantees.has(device.userId));
    const next: VaultContext = { ...vault, keyVersion: vault.keyVersion + 1 };
    const key = newVaultKey();
    const { envelopes, blocked, newPins } = this.sealForAll(key, holders, next, { ...context, pins: { ...context.pins, ...pins } });
    const variables = Object.entries(values).map(([name, value]) => {
      const ciphertext = encryptValue(key, name, value, next);
      return { name, keyVersion: next.keyVersion, ciphertext, signerDeviceKeyId: context.device.id, signature: signStatement(valueStatement(next, name, ciphertext), context.device.secrets) };
    });
    const result = await this.api.post<{ keyVersion: number; sealedFor: number }>(`${this.base(session)}/vaults/${vaultId}/rotate`, { keyVersion: next.keyVersion, envelopes, variables });
    this.savePins(session, { ...pins, ...newPins });
    return { keyVersion: result.keyVersion, sealedFor: result.sealedFor, blocked };
  }

  async history(session: Session, vaultId: string): Promise<EnvHistoryEntry[]> {
    const { history } = await this.api.get<{ history: { action: string; actor: string | null; subject: string | null; detail: string | null; createdAt: string }[] }>(`${this.base(session)}/vaults/${vaultId}/history`);
    return history.map((entry) => ({
      action: terminalSafe(entry.action),
      actor: entry.actor === null ? null : terminalSafe(entry.actor),
      subject: entry.subject === null ? null : terminalSafe(entry.subject),
      detail: entry.detail === null ? null : terminalSafe(entry.detail),
      createdAt: new Date(entry.createdAt),
    }));
  }

  async load(session: Session, vaultId: string): Promise<LoadedVault> {
    const context = await this.trustContext(session);
    const material = await this.material(session, vaultId);
    const { key, vault, pins } = this.openKey(session, material, context);
    const variables = this.decryptAll(material, key, vault, { ...context, pins: { ...context.pins, ...pins } });
    // Only now, with every signature checked, remember devices seen for the first time.
    this.savePins(session, { ...pins, ...this.valueSignerPins(material, { ...context, pins: { ...context.pins, ...pins } }) });
    return { vaultId, projectId: material.vault.projectId, environment: material.vault.environment, variables, expiresAt: material.access.expiresAt ? new Date(material.access.expiresAt) : null };
  }

  // ── Verification ─────────────────────────────────────────────────────

  /** Checks who sealed the key for this device and opens it. Throws on anything unexpected. */
  private openKey(session: Session, material: Material, context: TrustContext): { key: Buffer; vault: VaultContext; pins: Record<string, TrustedDevice> } {
    const vault: VaultContext = { workspaceId: session.workspace.id, vaultId: material.vault.id, environment: material.vault.environment, keyVersion: material.vault.keyVersion };
    if (material.envelope.keyVersion !== vault.keyVersion) throw tampered('The key you received is not the current one.');
    const signer = material.signers.find((device) => device.id === material.envelope.signerDeviceKeyId);
    if (!signer) throw tampered('The key you received has no known signer.');
    const decision = this.decide(signer, context);
    const role = acceptedRole(decision);
    if (vault.environment === 'production' && role !== 'owner') throw tampered('Production keys must be shared by an owner.');
    const signingKey = decision.kind === 'trusted' && decision.pinned ? decision.pinned.signingKey : signer.signingKey;
    if (!verifyStatement(envelopeStatement(vault, context.device.id, material.envelope.sealed), material.envelope.signature, signingKey)) {
      throw tampered('The signature on your key does not match.');
    }
    const key = openVaultKey(material.envelope.sealed, { id: context.device.id, secrets: context.device.secrets }, vault);
    return { key, vault, pins: decision.kind === 'first-use' ? { [signer.id]: decision.pin } : {} };
  }

  /** Every value must be signed by a trusted owner device, for this exact vault, name and key version. */
  private decryptAll(material: Material, key: Buffer, vault: VaultContext, context: TrustContext): Record<string, string> {
    const values: Record<string, string> = {};
    for (const variable of material.variables) {
      if (variable.keyVersion !== vault.keyVersion) throw tampered(`${variable.name} was not encrypted with the current key.`);
      const signer = material.signers.find((device) => device.id === variable.signerDeviceKeyId);
      if (!signer) throw tampered(`${variable.name} has no known signer.`);
      const decision = this.decide(signer, context);
      if (acceptedRole(decision) !== 'owner') throw tampered(`${variable.name} was not written by a workspace owner.`);
      const signingKey = decision.kind === 'trusted' && decision.pinned ? decision.pinned.signingKey : signer.signingKey;
      if (!verifyStatement(valueStatement(vault, variable.name, variable.ciphertext), variable.signature, signingKey)) throw tampered(`The signature on ${variable.name} does not match.`);
      values[variable.name] = decryptValue(key, variable.name, variable.ciphertext, vault);
    }
    return values;
  }

  private valueSignerPins(material: Material, context: TrustContext): Record<string, TrustedDevice> {
    const pins: Record<string, TrustedDevice> = {};
    for (const signer of material.signers) {
      const decision = this.decide(signer, context);
      if (decision.kind === 'first-use') pins[signer.id] = decision.pin;
    }
    return pins;
  }

  private decide(device: ServerDevice, context: TrustContext): TrustDecision {
    return decideTrust(device, context.pins, { device: context.device, userId: context.userId, role: context.role }, this.clock());
  }

  // ── Sealing ──────────────────────────────────────────────────────────

  private sealFor(key: Buffer, recipient: { id: string; encryptionKey: string }, vault: VaultContext, context: TrustContext): Envelope {
    const sealed = sealVaultKey(key, recipient, vault);
    return { deviceKeyId: recipient.id, sealed, signerDeviceKeyId: context.device.id, signature: signStatement(envelopeStatement(vault, recipient.id, sealed), context.device.secrets) };
  }

  /** Seals to every device you can trust; the others are reported by name so someone can compare fingerprints. */
  private sealForAll(key: Buffer, devices: ServerDevice[], vault: VaultContext, context: TrustContext) {
    const envelopes: Envelope[] = [];
    const blocked: string[] = [];
    const newPins: Record<string, TrustedDevice> = {};
    for (const device of devices) {
      const decision = this.decide(device, { ...context, pins: { ...context.pins, ...newPins } });
      if (decision.kind === 'blocked') {
        blocked.push(`@${device.username ?? device.userId} · ${device.label} · ${decision.fingerprint}`);
        continue;
      }
      if (decision.kind === 'first-use') newPins[device.id] = decision.pin;
      const encryptionKey = decision.kind === 'trusted' && decision.pinned ? decision.pinned.encryptionKey : device.encryptionKey;
      envelopes.push(this.sealFor(key, { id: device.id, encryptionKey }, vault, context));
    }
    return { envelopes, blocked, newPins };
  }

  // ── Plumbing ─────────────────────────────────────────────────────────

  private base(session: Session): string {
    return `/v1/workspaces/${session.workspace.id}/env`;
  }

  private async material(session: Session, vaultId: string): Promise<Material> {
    const device = this.requireDevice();
    const material = await this.api.get<Material>(`${this.base(session)}/vaults/${encodeURIComponent(vaultId)}/material?device=${device.id}`);
    return { ...material, signers: material.signers.map(safeDevice) };
  }

  private async serverDevices(session: Session): Promise<ServerDevice[]> {
    return (await this.api.get<{ devices: ServerDevice[] }>(`${this.base(session)}/devices`)).devices.map(safeDevice);
  }

  private async trustContext(session: Session): Promise<TrustContext> {
    const device = this.requireDevice();
    const { role } = await this.api.get<{ role: 'owner' | 'member' }>(`/v1/workspaces/${session.workspace.id}`);
    return { device, userId: session.user.id, role, pins: this.keys.trusted(this.api.baseUrl, session.workspace.id) };
  }

  private requireDevice(): ThisDevice {
    const device = this.keys.device(this.api.baseUrl);
    if (!device) throw new SojaError('This machine is not set up for shared environment variables yet.', { hint: 'Run `soja env setup`.' });
    return device;
  }

  private savePins(session: Session, pins: Record<string, TrustedDevice>) {
    for (const [id, pin] of Object.entries(pins)) this.keys.trust(this.api.baseUrl, session.workspace.id, id, pin);
  }

  private view(device: ServerDevice, context: TrustContext): EnvDeviceView {
    const decision = this.decide(device, context);
    const trust: EnvDeviceView['trust'] =
      device.id === context.device.id ? 'this'
        : decision.kind === 'blocked' ? 'blocked'
          : decision.kind === 'first-use' ? 'new'
            : decision.pinned?.how === 'confirmed' ? 'confirmed' : 'pinned';
    return { id: device.id, userId: device.userId, username: device.username ?? device.userId, role: device.role ?? 'member', label: device.label, fingerprint: fingerprint(device), trust };
  }
}

function acceptedRole(decision: TrustDecision): 'owner' | 'member' {
  if (decision.kind === 'blocked') {
    const who = `@${decision.device.username ?? decision.device.userId} (${decision.device.label}, ${decision.fingerprint})`;
    throw new SojaError(
      decision.reason === 'key-changed' ? `The keys of ${who} changed.` : `${who} is a device SOJA has not seen before.`,
      { hint: `Compare that fingerprint with its owner, then run \`soja env trust ${decision.device.id}\`.` },
    );
  }
  return decision.role;
}

function requireOwner(context: TrustContext, what: string) {
  if (context.role !== 'owner') throw new SojaError(`Only workspace owners can ${what}.`);
}

function tampered(message: string): SojaError {
  return new SojaError(`${message} SOJA did not use these variables.`, { hint: 'This should never happen: tell a workspace owner. Nothing was decrypted into your environment.' });
}

function toView(row: VaultRow): EnvVaultView {
  return {
    id: row.id,
    projectId: row.projectId,
    environment: row.environment,
    keyVersion: row.keyVersion,
    variables: row.variables,
    names: (row.names ?? []).filter((entry) => NAME.test(entry.name)).map((entry) => ({ name: entry.name, updatedAt: new Date(entry.updatedAt) })),
    canRead: row.access.canRead,
    canShare: row.access.canShare,
    canWrite: row.access.canWrite,
    expiresAt: row.access.expiresAt ? new Date(row.access.expiresAt) : null,
    rotationRequired: row.rotationRequired ?? false,
    pendingDevices: (row.pendingDevices ?? []).map(safeDevice).map((device) => ({ id: device.id, username: device.username, label: device.label })),
    grants: (row.grants ?? []).map((grant) => ({ userId: grant.userId, username: terminalSafe(grant.username), expiresAt: new Date(grant.expiresAt) })),
  };
}

function unreachable(): never {
  throw new Error('unreachable');
}
