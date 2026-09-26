import type { ConfigStore } from '../../config/config.js';

/** Per-machine interface preferences, kept in the config file. */
export class PreferenceService {
  constructor(private readonly config: ConfigStore) {}

  /** Whether the interface reports the mouse. On unless turned off. */
  mouse(): boolean {
    return this.config.load()?.mouse ?? true;
  }

  /** Before setup there is no config file yet: the choice then lasts for this session only. */
  setMouse(on: boolean): void {
    const current = this.config.load();
    if (current) this.config.save({ ...current, mouse: on });
  }
}
