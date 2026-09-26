import { useAppState } from '../app-state.js';
import { useMouseSwitch } from '../input/KeyProvider.js';

/**
 * Turns the mouse on or off now and remembers it on this machine. With the
 * mouse off the terminal selects and copies text as usual; `M` brings it back.
 */
export function useMouseToggle(): { enabled: boolean; toggle: () => void } {
  const { services, notify } = useAppState();
  const mouse = useMouseSwitch();
  const toggle = () => {
    const next = !mouse.enabled;
    mouse.set(next);
    services.preferences.setMouse(next);
    if (next) notify('Mouse on', 'success');
    else notify('Mouse off', 'success', 'Press M to turn it back on.');
  };
  return { enabled: mouse.enabled, toggle };
}
