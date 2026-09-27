import { Box, Text } from 'ink';
import { useState } from 'react';
import { normalizeGlobalShortcut, type GlobalShortcut } from '../../application/services/preference-service.js';
import { useAppState } from '../app-state.js';
import { useLayout } from '../hooks/use-layout.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Panel } from '../kit/Panel.js';
import { ScreenFrame } from './ScreenFrame.js';
import { palette } from '../theme/theme.js';

const ACTIONS: readonly { id: GlobalShortcut; label: string }[] = [
  { id: 'commands', label: 'Command palette' },
  { id: 'search', label: 'Search' },
  { id: 'newTask', label: 'New task' },
  { id: 'projects', label: 'Projects' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'finance', label: 'Finance' },
  { id: 'access', label: 'Access requests' },
  { id: 'chat', label: 'Chat' },
  { id: 'mouse', label: 'Toggle mouse' },
  { id: 'help', label: 'Help' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'My profile' },
  { id: 'quit', label: 'Quit / back' },
];

export function SettingsScreen({ active }: { active: boolean }) {
  const { services, openOverlay, run, notify } = useAppState();
  const { height } = useLayout();
  const shortcuts = services.preferences.keyboardShortcuts();
  const [selected, setSelected] = useState(0);

  useKeys(Layer.screen, (input, key) => {
    if (key.upArrow) { setSelected((index) => Math.max(0, index - 1)); return true; }
    if (key.downArrow) { setSelected((index) => Math.min(ACTIONS.length - 1, index + 1)); return true; }
    if (key.ctrl && input.toLowerCase() === 'r') {
      void run(async () => services.preferences.resetKeyboardShortcuts(), 'Default shortcuts restored');
      return true;
    }
    if (key.return) {
      const action = ACTIONS[selected];
      if (!action) return false;
      const current = services.preferences.keyboardShortcuts();
      openOverlay({
        kind: 'prompt',
        title: `Shortcut for ${action.label}`,
        initial: current[action.id],
        placeholder: 'One key or Ctrl+letter',
        onSubmit: (value) => {
          const normalized = normalizeGlobalShortcut(value);
          if (!normalized) { notify('Use one printable key or Ctrl+letter. Ctrl+R is reserved for reset.', 'error'); return false; }
          const conflict = ACTIONS.find((candidate) => candidate.id !== action.id && normalizeGlobalShortcut(current[candidate.id]) === normalized);
          if (conflict) { notify(`That key is already assigned to ${conflict.label}.`, 'error'); return false; }
          return run(async () => services.preferences.setKeyboardShortcut(action.id, normalized), `${action.label} shortcut saved`);
        },
      });
      return true;
    }
    return false;
  }, active);

  return (
    <ScreenFrame title="Settings" hints={[[ '↑↓', 'select' ], [ 'enter', 'change shortcut' ], [ 'ctrl+r', 'reset' ], [ 'esc', 'back' ]] }>
      <Box flexDirection="column" gap={1}>
        <Panel title="Keyboard shortcuts · global navigation" height={Math.max(3, Math.min(ACTIONS.length + 3, height - 2))}>
          {ACTIONS.map((action, index) => {
            const chosen = selected === index;
            return (
              <Box key={action.id} justifyContent="space-between" backgroundColor={chosen ? palette.selection : undefined}>
                <Text color={chosen ? palette.accent : palette.text}>{`${chosen ? '▌ ' : '  '}${action.label}`}</Text>
                <Text color={palette.warning} bold>{shortcuts[action.id]}</Text>
              </Box>
            );
          })}
        </Panel>
        <Text color={palette.faint}>Changes are saved on this machine. Enter a key or Ctrl+letter; screen-specific task and chat shortcuts stay unchanged.</Text>
        <Text color={palette.faint}>Profile: use {shortcuts.profile} or select your username in the top bar.</Text>
      </Box>
    </ScreenFrame>
  );
}
