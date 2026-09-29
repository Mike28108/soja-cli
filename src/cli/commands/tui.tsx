import { render } from 'ink';
import { SojaError } from '../../domain/errors.js';
import { bootstrap, createUpdater } from '../../bootstrap.js';
import { detectThemeMode } from '../../ui/theme/detect.js';
import { setThemeMode } from '../../ui/theme/theme.js';
import { App } from '../../ui/App.js';
import { FileConfigStore } from '../../config/config.js';
import { CredentialStore } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import type { Route } from '../../ui/navigation/routes.js';
import { EnvAgent } from '../../env/agent.js';
import { toDisplayError } from '../../utils/errors.js';

export async function runInterface(options: { route?: Route } = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new SojaError("SOJA's interface needs an interactive terminal.", {
      hint: 'For scripts, use the commands in `soja --help`.',
    });
  }
  const paths = resolvePaths();
  const configStore = new FileConfigStore(paths.configFile);
  const savedConfig = configStore.load();
  const hasRemoteToken = savedConfig?.remote ? Boolean(new CredentialStore(paths.credentialsFile).token(savedConfig.remote.apiUrl)) : true;
  const runtime = await bootstrap({ forceLocal: savedConfig?.mode === 'remote' && !hasRemoteToken });
  let reopenInCurrentMode = false;
  // Shared environment variables are served to `soja run` only while this interface is open.
  const agent = runtime.services.env?.thisDevice() ? new EnvAgent(runtime.services) : null;
  let agentNotice: { text: string; hint?: string } | undefined;
  const agentState = agent
    ? await agent.start().catch((error: unknown) => {
        const display = toDisplayError(error);
        agentNotice = { text: `soja run is unavailable: ${display.message}`, ...(display.hint ? { hint: display.hint } : {}) };
        return 'unavailable' as const;
      })
    : null;
  // A daily copy of the database in use, kept for a week. Never blocks opening SOJA.
  try {
    runtime.services.backups.auto();
  } catch {
    // Best effort: `soja backup` reports problems when asked directly.
  }
  try {
    const updates = createUpdater();
    // Light or dark palette, from the terminal's own background (SOJA_THEME overrides).
    setThemeMode(await detectThemeMode());
    const instance = render(
      <App services={runtime.services} welcomeOnLocal={savedConfig?.mode === 'remote' && !hasRemoteToken} updates={{ check: () => updates.cachedCheck(), install: (version) => updates.install(version) }} mouse={process.env.SOJA_MOUSE !== '0' && runtime.services.preferences.mouse()} {...(options.route ? { initialRoute: options.route } : {})} {...(agentNotice ? { notice: agentNotice } : {})} />, { alternateScreen: true, exitOnCtrlC: true });
    await instance.waitUntilExit();
    reopenInCurrentMode = new FileConfigStore(runtime.paths.configFile).load()?.mode !== runtime.services.environment.mode;
  } finally {
    // Stops every `soja run` started through this SOJA, then the rest.
    if (agentState === 'started') agent?.close();
    runtime.close();
  }
  if (reopenInCurrentMode) await runInterface(options);
}
