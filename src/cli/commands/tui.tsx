import { render } from 'ink';
import { SojaError } from '../../domain/errors.js';
import { bootstrap } from '../../bootstrap.js';
import { App } from '../../ui/App.js';

export async function runInterface(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new SojaError("SOJA's interface needs an interactive terminal.", {
      hint: 'For scripts, use the commands in `soja --help`.',
    });
  }
  const runtime = await bootstrap();
  try {
    const instance = render(<App services={runtime.services} />, { alternateScreen: true, exitOnCtrlC: true });
    await instance.waitUntilExit();
  } finally {
    runtime.close();
  }
}
