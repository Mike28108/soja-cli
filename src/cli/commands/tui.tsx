import { render } from 'ink';
import { SojaError } from '../../domain/errors.js';
import { bootstrap, createUpdater } from '../../bootstrap.js';
import { detectThemeMode } from '../../ui/theme/detect.js';
import { setThemeMode } from '../../ui/theme/theme.js';
import { App } from '../../ui/App.js';
import type { Route } from '../../ui/navigation/routes.js';

export async function runInterface(options: { route?: Route } = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new SojaError("SOJA's interface needs an interactive terminal.", {
      hint: 'For scripts, use the commands in `soja --help`.',
    });
  }
  const runtime = await bootstrap();
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
      <App services={runtime.services} updates={() => updates.cachedCheck()} mouse={process.env.SOJA_MOUSE !== '0'} {...(options.route ? { initialRoute: options.route } : {})} />, { alternateScreen: true, exitOnCtrlC: true });
    await instance.waitUntilExit();
  } finally {
    runtime.close();
  }
}
