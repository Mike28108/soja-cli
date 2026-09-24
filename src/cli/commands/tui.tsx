import { render } from 'ink';
import { SojaError } from '../../domain/errors.js';
import { bootstrap } from '../../bootstrap.js';
import { App } from '../../ui/App.js';
import type { Route } from '../../ui/navigation/routes.js';

export async function runInterface(options: { route?: Route } = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new SojaError("SOJA's interface needs an interactive terminal.", {
      hint: 'For scripts, use the commands in `soja --help`.',
    });
  }
  const runtime = await bootstrap();
  try {
    const instance = render(<App services={runtime.services} {...(options.route ? { initialRoute: options.route } : {})} />, { alternateScreen: true, exitOnCtrlC: true });
    await instance.waitUntilExit();
  } finally {
    runtime.close();
  }
}
