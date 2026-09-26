import { describe, expect, it } from 'vitest';
import { PreferenceService } from '../../src/application/services/preference-service.js';
import { MemoryConfigStore } from '../../src/config/config.js';

describe('interface preferences', () => {
  it('uses the mouse unless it was turned off, and remembers the choice', () => {
    const config = new MemoryConfigStore({ mode: 'local', parentFolders: [] });
    const preferences = new PreferenceService(config);
    expect(preferences.mouse()).toBe(true);
    preferences.setMouse(false);
    expect(preferences.mouse()).toBe(false);
    expect(config.load()?.mouse).toBe(false);
    preferences.setMouse(true);
    expect(preferences.mouse()).toBe(true);
  });

  it('keeps the choice for the session only before SOJA is set up', () => {
    const config = new MemoryConfigStore();
    const preferences = new PreferenceService(config);
    preferences.setMouse(false);
    expect(config.load()).toBeNull();
    expect(preferences.mouse()).toBe(true);
  });
});
