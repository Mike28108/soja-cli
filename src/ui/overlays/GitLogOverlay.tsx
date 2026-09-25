import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { useAppState } from '../app-state.js';
import { ConsoleLines } from '../components/ConsoleLines.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette } from '../theme/theme.js';
import { OverlayFrame, useOverlayHeight } from './OverlayFrame.js';
import type { Overlay } from './types.js';

/** Everything SOJA has run in Git during this session, updating live. */
export function GitLogOverlay({ spec }: { spec: Overlay }) {
  const { services, closeOverlay } = useAppState();
  const [lines, setLines] = useState(() => services.gitConsole.since());
  const height = Math.min(20, useOverlayHeight());
  useEffect(() => services.gitConsole.subscribe(() => setLines(services.gitConsole.since())), [services.gitConsole]);
  useKeys(Layer.overlay, (_input, key) => {
    if (key.escape || key.return) closeOverlay(spec);
    return true;
  });
  return (
    <OverlayFrame title="Git log" context="commands SOJA ran this session" width={100} hints={[['esc', 'close']]}>
      {lines.length === 0 ? <Text color={palette.faint}>Nothing yet. Git operations you run from SOJA show up here, live.</Text> : <ConsoleLines lines={lines.slice(-height)} />}
    </OverlayFrame>
  );
}
