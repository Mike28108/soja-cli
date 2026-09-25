import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ReleaseSource } from '../../git/releases.js';

const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheck {
  current: string;
  latest: string;
  available: boolean;
}

/** Newer versions of SOJA, from its GitHub releases. Checks at most once a day unless asked. */
export class UpdateService {
  constructor(
    private readonly releases: ReleaseSource,
    private readonly current: string,
    private readonly cacheFile: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Fresh from GitHub. */
  async check(): Promise<UpdateCheck> {
    const latest = (await this.releases.latest()).replace(/^v/, '');
    this.remember(latest);
    return { current: this.current, latest, available: isNewer(latest, this.current) };
  }

  /** For a quiet notice: uses yesterday's answer when it is recent, and never throws. */
  async cachedCheck(): Promise<UpdateCheck | null> {
    try {
      const cached = JSON.parse(readFileSync(this.cacheFile, 'utf8')) as { checkedAt: string; latest: string };
      if (this.clock().getTime() - new Date(cached.checkedAt).getTime() < CHECK_EVERY_MS) {
        return { current: this.current, latest: cached.latest, available: isNewer(cached.latest, this.current) };
      }
    } catch {
      // No cache yet, or unreadable: ask GitHub.
    }
    return this.check().catch(() => null);
  }

  /** Downloads and installs `latest` (the terminal is attached for npm). */
  async install(latest: string): Promise<void> {
    const file = await this.releases.download(`v${latest}`);
    await this.releases.install(file);
  }

  private remember(latest: string): void {
    try {
      mkdirSync(dirname(this.cacheFile), { recursive: true });
      writeFileSync(this.cacheFile, JSON.stringify({ checkedAt: this.clock().toISOString(), latest }));
    } catch {
      // The cache only saves a request.
    }
  }
}

/** `1.10.0` > `1.9.2`. Pre-release suffixes are ignored. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (version: string) => version.split('-')[0]?.split('.').map((part) => Number(part) || 0) ?? [];
  const [a, b] = [parts(candidate), parts(current)];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
