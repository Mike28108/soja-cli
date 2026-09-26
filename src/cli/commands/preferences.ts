import { PreferenceService } from '../../application/services/preference-service.js';
import { FileConfigStore } from '../../config/config.js';
import { resolvePaths } from '../../config/paths.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import { bold, dim, print, success } from '../output.js';
import { parseCommand } from './args.js';

/** `soja mouse [on|off]`: whether the interface uses the mouse on this machine. */
export async function mouseCommand(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const store = new FileConfigStore(resolvePaths().configFile);
  const preferences = new PreferenceService(store);
  const target = positionals[0];
  if (!target) {
    print(`mouse ${bold(preferences.mouse() ? 'on' : 'off')}`);
    if (process.env.SOJA_MOUSE === '0') print(dim('SOJA_MOUSE=0 turns it off for this shell anyway.'));
    return;
  }
  if (target !== 'on' && target !== 'off') throw new ValidationError('Use `soja mouse on` or `soja mouse off`.');
  if (!store.load()) throw new SojaError('SOJA is not set up yet.', { hint: 'Run `soja` once; `M` in the interface also switches the mouse.' });
  preferences.setMouse(target === 'on');
  success(`Mouse ${bold(target)}${target === 'off' ? dim(' · the terminal selects and copies text as usual; M in the interface turns it back on') : ''}.`);
}
