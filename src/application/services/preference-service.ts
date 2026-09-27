import type { ConfigStore } from '../../config/config.js';

export const GLOBAL_SHORTCUTS = {
  commands: ':',
  search: '/',
  newTask: 'n',
  projects: 'p',
  workspaces: 'w',
  finance: 'f',
  access: 'A',
  chat: '#',
  mouse: 'M',
  help: '?',
  settings: ',',
  profile: 'u',
  quit: 'q',
} as const;

export type GlobalShortcut = keyof typeof GLOBAL_SHORTCUTS;

export function normalizeGlobalShortcut(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (/^\S$/u.test(key) && key.length === 1) return key;
  if (/^ctrl\+[a-z]$/.test(key) && key !== 'ctrl+r') return key;
  return null;
}

export function matchesGlobalShortcut(input: string, key: { ctrl: boolean; meta: boolean }, binding: string): boolean {
  const normalized = normalizeGlobalShortcut(binding);
  if (!normalized) return false;
  const control = /^ctrl\+([a-z])$/.exec(normalized);
  if (control) return key.ctrl && !key.meta && input.toLowerCase() === control[1];
  return !key.ctrl && !key.meta && input === binding;
}

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

  keyboardShortcuts(): Record<GlobalShortcut, string> {
    return { ...GLOBAL_SHORTCUTS, ...this.config.load()?.keyboardShortcuts };
  }

  setKeyboardShortcut(action: GlobalShortcut, key: string): void {
    const normalized = normalizeGlobalShortcut(key);
    if (!normalized) throw new Error('Use one printable key or a Ctrl+letter combination. Ctrl+R is reserved for reset.');
    const current = this.keyboardShortcuts();
    const conflict = (Object.keys(current) as GlobalShortcut[]).find((other) => other !== action && normalizeGlobalShortcut(current[other]) === normalized);
    if (conflict) throw new Error(`That key is already assigned to ${conflict}.`);
    const config = this.config.load();
    if (config) this.config.save({ ...config, keyboardShortcuts: { ...config.keyboardShortcuts, [action]: normalized } });
  }

  resetKeyboardShortcuts(): void {
    const config = this.config.load();
    if (config) {
      const reset = { ...config };
      delete reset.keyboardShortcuts;
      this.config.save(reset);
    }
  }
}
