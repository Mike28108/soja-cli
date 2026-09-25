import { describe, expect, it } from 'vitest';
import { Layer } from '../../src/ui/input/dispatcher.js';
import { MouseDispatcher, parseMouse } from '../../src/ui/input/mouse.js';
import { modeFromColorFgBg, modeFromOscReply } from '../../src/ui/theme/detect.js';
import { palette, setThemeMode, toneColors } from '../../src/ui/theme/theme.js';

describe('mouse reports', () => {
  it('reads SGR presses, releases and the wheel, 0-based', () => {
    expect(parseMouse('[<0;15;6M')).toEqual({ kind: 'press', button: 'left', x: 14, y: 5 });
    expect(parseMouse('[<0;15;6m')).toEqual({ kind: 'release', button: 'left', x: 14, y: 5 });
    expect(parseMouse('[<2;1;1M')).toMatchObject({ kind: 'press', button: 'right' });
    expect(parseMouse('[<64;5;3M')).toMatchObject({ kind: 'wheel-up' });
    expect(parseMouse('[<65;5;3M')).toMatchObject({ kind: 'wheel-down' });
    expect(parseMouse('M')).toBeNull();
    expect(parseMouse('[A')).toBeNull();
  });

  it('sends a click to the top layer, and within it to the smallest region under the point', () => {
    const mouse = new MouseDispatcher();
    const hits: string[] = [];
    mouse.register(Layer.screen, () => ({ x: 0, y: 0, width: 80, height: 20 }), () => ({ onClick: () => hits.push('screen') }));
    mouse.register(Layer.screen, () => ({ x: 2, y: 2, width: 10, height: 1 }), () => ({ onClick: () => hits.push('row') }));
    mouse.dispatch({ kind: 'press', button: 'left', x: 3, y: 2 });
    mouse.dispatch({ kind: 'press', button: 'left', x: 40, y: 10 });
    const unregister = mouse.register(Layer.overlay, () => ({ x: 0, y: 0, width: 80, height: 20 }), () => ({ onClick: () => hits.push('backdrop') }));
    mouse.dispatch({ kind: 'press', button: 'left', x: 3, y: 2 });
    unregister();
    // Releases and right clicks do nothing.
    mouse.dispatch({ kind: 'release', button: 'left', x: 3, y: 2 });
    mouse.dispatch({ kind: 'press', button: 'right', x: 3, y: 2 });
    expect(hits).toEqual(['row', 'screen', 'backdrop']);
  });

  it('scrolls the region under the wheel', () => {
    const mouse = new MouseDispatcher();
    const moves: number[] = [];
    mouse.register(Layer.screen, () => ({ x: 0, y: 0, width: 10, height: 10 }), () => ({ onWheel: (direction) => moves.push(direction) }));
    mouse.dispatch({ kind: 'wheel-down', button: 'none', x: 1, y: 1 });
    mouse.dispatch({ kind: 'wheel-up', button: 'none', x: 1, y: 1 });
    mouse.dispatch({ kind: 'wheel-up', button: 'none', x: 50, y: 50 });
    expect(moves).toEqual([1, -1]);
  });
});

describe('light and dark palettes', () => {
  it('reads COLORFGBG and the OSC 11 background reply', () => {
    expect(modeFromColorFgBg('15;0')).toBe('dark');
    expect(modeFromColorFgBg('0;15')).toBe('light');
    expect(modeFromColorFgBg('0;7')).toBe('light');
    expect(modeFromColorFgBg(undefined)).toBeNull();
    expect(modeFromOscReply('\u001b]11;rgb:ffff/ffff/ffff\u001b\\')).toBe('light');
    expect(modeFromOscReply('\u001b]11;rgb:1e1e/1e1e/2e2e\u0007')).toBe('dark');
    expect(modeFromOscReply('garbage')).toBeNull();
  });

  it('switches every token at once', () => {
    setThemeMode('light');
    const light = { ...palette };
    setThemeMode('dark');
    expect(light.text).not.toBe(palette.text);
    expect(toneColors('danger').fg).toBe(palette.danger);
  });
});
