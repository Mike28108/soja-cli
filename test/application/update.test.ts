import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNewer, UpdateService } from '../../src/application/services/update-service.js';
import { NpmReleases, type ReleaseSource } from '../../src/git/releases.js';
import { tempDir } from '../helpers.js';

let dir: ReturnType<typeof tempDir>;
beforeEach(() => {
  dir = tempDir();
});
afterEach(() => dir.cleanup());

function source(tag: string): ReleaseSource & { asked: number; installed: string[] } {
  return {
    asked: 0,
    installed: [],
    async latest() {
      this.asked += 1;
      return tag;
    },
    async download(version) {
      return `/tmp/soja-cli-${version}.tgz`;
    },
    async install(path) {
      this.installed.push(path);
    },
  };
}

describe('updates', () => {
  it('compares versions numerically', () => {
    expect(isNewer('1.10.0', '1.9.2')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
    expect(isNewer('1.0.1-beta', '1.0.0')).toBe(true);
  });

  it('asks GitHub at most once a day for the quiet notice, and installs the release package', async () => {
    let now = new Date('2026-09-24T10:00:00Z');
    const releases = source('v1.1.0');
    const updates = new UpdateService(releases, '1.0.0', join(dir.path, 'update-check.json'), () => now);
    expect(await updates.cachedCheck()).toEqual({ current: '1.0.0', latest: '1.1.0', available: true });
    await updates.cachedCheck();
    expect(releases.asked).toBe(1);
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    await updates.cachedCheck();
    expect(releases.asked).toBe(2);
    await updates.install('1.1.0');
    expect(releases.installed).toEqual(['/tmp/soja-cli-1.1.0.tgz']);
  });

  it('stays quiet when GitHub cannot be asked', async () => {
    const failing: ReleaseSource = {
      latest: () => Promise.reject(new Error('gh missing')),
      download: () => Promise.reject(new Error('no')),
      install: () => Promise.resolve(),
    };
    expect(await new UpdateService(failing, '1.0.0', join(dir.path, 'x.json')).cachedCheck()).toBeNull();
  });
});

describe('npm as the release source', () => {
  const registry = (status: number, body: unknown) => {
    const requests: { url: string; accept: string | null }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), accept: new Headers(init?.headers).get('accept') });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    return { requests, fetchImpl };
  };

  it('asks the /latest document for plain JSON, the only format it serves', async () => {
    const { requests, fetchImpl } = registry(200, { name: 'soja-cli', version: '1.5.1' });
    await expect(new NpmReleases('soja-cli', fetchImpl).latest()).resolves.toBe('1.5.1');
    expect(requests).toEqual([{ url: 'https://registry.npmjs.org/soja-cli/latest', accept: 'application/json' }]);
  });

  it('explains a registry error and rejects a malformed version', async () => {
    await expect(new NpmReleases('soja-cli', registry(406, {}).fetchImpl).latest()).rejects.toThrow('npm registry returned 406');
    await expect(new NpmReleases('soja-cli', registry(200, { version: '1.5; rm -rf' }).fetchImpl).latest()).rejects.toThrow('invalid SOJA version');
  });
});
