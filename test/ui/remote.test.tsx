import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryConfigStore } from '../../src/config/config.js';
import { CredentialStore } from '../../src/config/credentials.js';
import { bootstrap, type AppRuntime } from '../../src/bootstrap.js';
import { App } from '../../src/ui/App.js';
import { FakeSojaServer } from '../data/fake-soja-server.js';
import { tempDir } from '../helpers.js';

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

let runtime: AppRuntime | undefined;
let ui: ReturnType<typeof render> | undefined;
let dir: ReturnType<typeof tempDir>;
afterEach(() => {
  ui?.unmount();
  runtime?.close();
  dir.cleanup();
});

describe('remote mode in the interface', () => {
  it('shows the real number as soon as a new task is synced, without reopening SOJA', async () => {
    dir = tempDir();
    const server = new FakeSojaServer();
    const userId = server.addUser('michael');
    const credentials = new CredentialStore(join(dir.path, 'credentials.json'));
    credentials.save('https://soja.test', server.tokenFor(userId), 'michael');
    runtime = await bootstrap({
      paths: { dataDir: dir.path, configDir: '', configFile: '', credentialsFile: '', databaseFile: ':memory:' },
      config: new MemoryConfigStore({ mode: 'remote', parentFolders: [], remote: { apiUrl: 'https://soja.test', userId } }),
      credentials,
      fetch: server.fetch,
      replicaFile: ':memory:',
    });

    ui = render(<App services={runtime.services} splashMs={0} cwd={dir.path} />);
    await settle(300);
    ui.stdin.write('n');
    await settle();
    for (const char of 'Created in the TUI') {
      ui.stdin.write(char);
      await settle(10);
    }
    ui.stdin.write('\r');
    await settle(80);
    expect(ui.lastFrame()).toContain('SOJA-?1');

    // The change is pushed shortly after (debounced); the list must follow on its own.
    await settle(1500);
    const frame = ui.lastFrame() ?? '';
    expect(frame).toContain('SOJA-1');
    expect(frame).not.toContain('SOJA-?1');
    expect(server.tasks.size).toBe(1);
  });
});
