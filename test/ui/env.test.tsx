import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiClient } from '../../src/data/remote/api-client.js';
import { RemoteEnvService } from '../../src/data/sync/env.js';
import { EnvKeyStore } from '../../src/env/keystore.js';
import { App } from '../../src/ui/App.js';
import { FakeEnvServer } from '../env/fake-env-server.js';
import { createSetUpApp, tempDir, waitForFrame, type TestApp } from '../helpers.js';

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const ENTER = '\r';

let app: TestApp | undefined;
let ui: ReturnType<typeof render> | undefined;
let dir: ReturnType<typeof tempDir> | undefined;
afterEach(() => {
  ui?.unmount();
  app?.close();
  dir?.cleanup();
});

async function type(text: string) {
  for (const char of text) {
    ui?.stdin.write(char);
    await settle(10);
  }
  await settle();
}

describe('environment variables in the interface', () => {
  it('an owner sets up the machine, creates development and adds a value typed as dots', async () => {
    dir = tempDir();
    const setUp = await createSetUpApp();
    app = setUp;
    const project = await setUp.services.projects.create(setUp.session, { name: 'EnrollBridge' });
    // The server shares the local workspace and user ids, as a real remote session would.
    const server = new FakeEnvServer(setUp.session.workspace.id);
    const { token } = server.addUser('michael', 'owner', setUp.session.user.id);
    const env = new RemoteEnvService(new ApiClient('https://soja.test', token, server.fetch), new EnvKeyStore(join(dir.path, 'env-keys.json')));
    ui = render(<App services={{ ...setUp.services, env }} splashMs={0} cwd={dir.path} initialRoute={{ name: 'env', projectId: project.id }} />);
    const frame = () => ui?.lastFrame() ?? '';

    expect(await waitForFrame(frame, (f) => f.includes('not set up for shared variables'))).toContain('Press S');
    ui.stdin.write('S');
    await waitForFrame(frame, (f) => f.includes('Set up this machine'));
    ui.stdin.write(ENTER);
    expect(await waitForFrame(frame, (f) => f.includes('Environments'))).toContain('Development');

    ui.stdin.write('c');
    await waitForFrame(frame, (f) => f.includes('press a to add one'));
    ui.stdin.write('a');
    await waitForFrame(frame, (f) => f.includes('New or changed variable'));
    await type('api_key');
    ui.stdin.write(ENTER);
    await waitForFrame(frame, (f) => f.includes('API_KEY · EnrollBridge development'));
    await type('sk_live_secret');
    const typing = frame();
    expect(typing).toContain('••••••••••••••');
    expect(typing).not.toContain('sk_live_secret');
    ui.stdin.write(ENTER);

    // Saved: the prompt is gone and the list shows the name with its value hidden.
    const saved = await waitForFrame(frame, (f) => f.includes('API_KEY ••••••••') && !f.includes('encrypted on this machine'));
    expect(saved).not.toContain('sk_live_secret');
    const stored = JSON.stringify([...server.vaults.values()].map((vault) => [...vault.variables.values()]));
    expect(stored).toContain('API_KEY');
    expect(stored).not.toContain('sk_live_secret');
    expect((await env.load(setUp.session, [...server.vaults.keys()][0] ?? '')).variables).toEqual({ API_KEY: 'sk_live_secret' });
  }, 30_000);
});
