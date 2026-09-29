import { randomUUID } from 'node:crypto';

/**
 * The environment-variable endpoints of soja-backend, in memory, with the same
 * rules (docs/ENV.md) — and with levers a compromised server would pull, so the
 * tests can prove the client refuses what it cannot verify.
 */

interface User { id: string; username: string; role: 'owner' | 'member' }
interface Device { id: string; userId: string; label: string; encryptionKey: string; signingKey: string; revokedAt: string | null }
interface Envelope { deviceKeyId: string; sealed: string; signerDeviceKeyId: string; signature: string }
interface Variable { name: string; keyVersion: number; ciphertext: string; signerDeviceKeyId: string; signature: string; updatedAt: string }
interface Vault {
  id: string;
  projectId: string;
  repositoryId: string | null;
  descriptor: { signature: string; signerDeviceKeyId: string } | null;
  environment: 'development' | 'staging' | 'production';
  keyVersion: number;
  rotationRequired: boolean;
  envelopes: Map<string, Envelope & { keyVersion: number }>;
  variables: Map<string, Variable>;
  grants: Map<string, { expiresAt: Date; revoked: boolean }>;
  history: string[];
}

export class FakeEnvServer {
  constructor(readonly workspaceId: string = randomUUID()) {}
  readonly users = new Map<string, User>();
  readonly devices = new Map<string, Device>();
  readonly vaults = new Map<string, Vault>();
  private tokens = new Map<string, string>();
  now = new Date('2026-10-01T12:00:00Z');

  addUser(username: string, role: 'owner' | 'member', id: string = randomUUID()): { id: string; token: string } {
    this.users.set(id, { id, username, role });
    const token = `token-${username}`;
    this.tokens.set(token, id);
    return { id, token };
  }

  /** What a server that wants in can do: register a device in someone's name. */
  plantDevice(userId: string, keys: { encryptionKey: string; signingKey: string }, label = 'planted'): Device {
    const device = { id: randomUUID(), userId, label, ...keys, revokedAt: null };
    this.devices.set(device.id, device);
    return device;
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const userId = this.tokens.get(String(new Headers(init?.headers).get('authorization')).replace('Bearer ', ''));
    const user = userId ? this.users.get(userId) : undefined;
    if (!user) return json(401, { error: { message: 'Sign in.' } });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    try {
      return this.route(method, url, user, body);
    } catch (error) {
      if (error instanceof Reply) return json(error.status, { error: { message: error.message } });
      throw error;
    }
  };

  private route(method: string, url: URL, user: User, body: Record<string, unknown>): Response {
    const path = url.pathname;
    const ws = `/v1/workspaces/${this.workspaceId}`;
    if (method === 'GET' && path === '/v1/devices') return json(200, { devices: [...this.devices.values()].filter((device) => device.userId === user.id) });
    if (method === 'POST' && path === '/v1/devices') {
      const device = { id: randomUUID(), userId: user.id, label: String(body.label), encryptionKey: String(body.encryptionKey), signingKey: String(body.signingKey), revokedAt: null };
      this.devices.set(device.id, device);
      return json(201, { device });
    }
    const removeDevice = /^\/v1\/devices\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && removeDevice) {
      const device = this.devices.get(removeDevice[1] ?? '');
      if (!device || device.userId !== user.id) throw new Reply(404, 'No such device.');
      device.revokedAt = this.now.toISOString();
      for (const vault of this.vaults.values()) if ([...vault.envelopes.values()].some((envelope) => envelope.deviceKeyId === device.id)) vault.rotationRequired = true;
      return json(200, { device });
    }
    if (method === 'GET' && path === ws) return json(200, { workspace: { id: this.workspaceId }, role: user.role });
    if (method === 'GET' && path === `${ws}/env/devices`) return json(200, { devices: this.activeDevices().map((device) => this.describe(device)) });
    if (method === 'GET' && path === `${ws}/env/vaults`) return json(200, { vaults: [...this.vaults.values()].map((vault) => this.view(vault, user)) });
    if (method === 'POST' && path === `${ws}/env/vaults`) {
      if (user.role !== 'owner') throw new Reply(403, 'Owners only.');
      const vault: Vault = { id: String(body.id), projectId: String(body.projectId), repositoryId: typeof body.repositoryId === 'string' ? body.repositoryId : null, descriptor: (body.descriptor as Vault['descriptor']) ?? null, environment: body.environment as Vault['environment'], keyVersion: 1, rotationRequired: false, envelopes: new Map(), variables: new Map(), grants: new Map(), history: ['vault_created'] };
      this.vaults.set(vault.id, vault);
      for (const envelope of body.envelopes as Envelope[]) vault.envelopes.set(envelope.deviceKeyId, { ...envelope, keyVersion: 1 });
      return json(201, { vault: { id: vault.id } });
    }
    const match = new RegExp(`^${ws}/env/vaults/([^/]+)(?:/(.*))?$`).exec(path);
    const vault = match ? this.vaults.get(match[1] ?? '') : undefined;
    if (!match || !vault) throw new Reply(404, 'No such environment.');
    const rest = match[2] ?? '';
    const canRead = user.role === 'owner' || this.hasGrant(vault, user.id);
    if (method === 'GET' && rest === 'material') {
      if (!canRead) throw new Reply(403, 'No access.');
      const deviceId = url.searchParams.get('device') ?? '';
      const envelope = vault.envelopes.get(deviceId);
      if (!envelope || envelope.keyVersion !== vault.keyVersion) throw new Reply(409, 'Not shared with this device yet.');
      vault.history.push('fetched');
      const signerIds = new Set([envelope.signerDeviceKeyId, ...(vault.descriptor ? [vault.descriptor.signerDeviceKeyId] : []), ...[...vault.variables.values()].map((variable) => variable.signerDeviceKeyId)]);
      return json(200, {
        vault: { id: vault.id, projectId: vault.projectId, repositoryId: vault.repositoryId, environment: vault.environment, keyVersion: vault.keyVersion, descriptor: vault.descriptor },
        access: { expiresAt: user.role === 'owner' ? null : vault.grants.get(user.id)?.expiresAt.toISOString() },
        envelope,
        variables: [...vault.variables.values()],
        signers: [...signerIds].flatMap((id) => { const device = this.devices.get(id); return device ? [this.describe(device)] : []; }),
      });
    }
    if (method === 'PUT' && rest === 'descriptor') {
      if (user.role !== 'owner') throw new Reply(403, 'Owners only.');
      if (vault.descriptor) throw new Reply(409, 'Already signed.');
      vault.descriptor = body as Vault['descriptor'];
      return json(200, { signed: true });
    }
    const variable = /^variables\/([^/]+)$/.exec(rest);
    if (variable && method === 'PUT') {
      if (user.role !== 'owner') throw new Reply(403, 'Owners only.');
      vault.variables.set(variable[1] ?? '', { name: variable[1] ?? '', ...(body as Omit<Variable, 'name' | 'updatedAt'>), updatedAt: this.now.toISOString() });
      return json(200, { name: variable[1] });
    }
    if (variable && method === 'DELETE') {
      vault.variables.delete(variable[1] ?? '');
      return json(200, { name: variable[1] });
    }
    if (method === 'POST' && rest === 'envelopes') {
      for (const envelope of body.envelopes as Envelope[]) vault.envelopes.set(envelope.deviceKeyId, { ...envelope, keyVersion: vault.keyVersion });
      return json(200, { shared: (body.envelopes as unknown[]).length });
    }
    if (method === 'POST' && rest === 'grants') {
      if (vault.environment === 'production' && user.role !== 'owner') throw new Reply(403, 'Owners only.');
      const expiresAt = new Date(this.now.getTime() + Number(body.days) * 86_400_000);
      vault.grants.set(String(body.userId), { expiresAt, revoked: false });
      for (const envelope of body.envelopes as Envelope[]) vault.envelopes.set(envelope.deviceKeyId, { ...envelope, keyVersion: vault.keyVersion });
      return json(201, { grant: { userId: body.userId, expiresAt: expiresAt.toISOString() } });
    }
    const revoke = /^grants\/([^/]+)$/.exec(rest);
    if (method === 'DELETE' && revoke) {
      const grant = vault.grants.get(revoke[1] ?? '');
      if (grant) grant.revoked = true;
      for (const [deviceId] of vault.envelopes) if (this.devices.get(deviceId)?.userId === revoke[1]) vault.envelopes.delete(deviceId);
      vault.rotationRequired = true;
      return json(200, { revoked: true });
    }
    if (method === 'POST' && rest === 'rotate') {
      if (Number(body.keyVersion) !== vault.keyVersion + 1) throw new Reply(409, 'Stale key version.');
      vault.keyVersion = Number(body.keyVersion);
      vault.rotationRequired = false;
      vault.envelopes = new Map((body.envelopes as Envelope[]).map((envelope) => [envelope.deviceKeyId, { ...envelope, keyVersion: vault.keyVersion }]));
      for (const next of body.variables as (Variable & { name: string })[]) vault.variables.set(next.name, { ...next, updatedAt: this.now.toISOString() });
      return json(200, { keyVersion: vault.keyVersion, sealedFor: vault.envelopes.size });
    }
    if (method === 'GET' && rest === 'history') return json(200, { history: vault.history.map((action) => ({ action, actor: null, subject: null, detail: null, createdAt: this.now.toISOString() })) });
    throw new Reply(404, `No route for ${method} ${path}`);
  }

  private hasGrant(vault: Vault, userId: string): boolean {
    const grant = vault.grants.get(userId);
    return Boolean(grant && !grant.revoked && grant.expiresAt > this.now);
  }

  private activeDevices(): Device[] {
    return [...this.devices.values()].filter((device) => !device.revokedAt);
  }

  private describe(device: Device) {
    const user = this.users.get(device.userId);
    return { ...device, username: user?.username ?? null, role: user?.role ?? null };
  }

  private view(vault: Vault, user: User) {
    const canRead = user.role === 'owner' || this.hasGrant(vault, user.id);
    const holders = new Set([...this.users.values()].filter((candidate) => candidate.role === 'owner' || this.hasGrant(vault, candidate.id)).map((candidate) => candidate.id));
    const pending = this.activeDevices().filter((device) => holders.has(device.userId) && vault.envelopes.get(device.id)?.keyVersion !== vault.keyVersion);
    const canShare = user.role === 'owner' || (vault.environment !== 'production' && this.hasGrant(vault, user.id));
    return {
      id: vault.id,
      projectId: vault.projectId,
      repositoryId: vault.repositoryId,
      descriptor: vault.descriptor,
      environment: vault.environment,
      keyVersion: vault.keyVersion,
      variables: vault.variables.size,
      ...(canRead ? { names: [...vault.variables.values()].map((variable) => ({ name: variable.name, updatedAt: variable.updatedAt })) } : {}),
      access: { canRead, canShare, canWrite: user.role === 'owner', expiresAt: user.role === 'owner' ? null : (vault.grants.get(user.id)?.expiresAt.toISOString() ?? null) },
      ...(user.role === 'owner' ? { rotationRequired: vault.rotationRequired, grants: [...vault.grants.entries()].filter(([id]) => this.hasGrant(vault, id)).map(([id, grant]) => ({ userId: id, username: this.users.get(id)?.username, expiresAt: grant.expiresAt.toISOString() })) } : {}),
      ...(canShare ? { pendingDevices: pending.map((device) => this.describe(device)) } : {}),
    };
  }
}

class Reply extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
