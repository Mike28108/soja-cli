import { Box, Text } from 'ink';
import { APP_DESCRIPTION, APP_NAME } from '../branding/brand.js';
import { useLayout } from '../hooks/use-layout.js';
import { palette } from '../theme/theme.js';
import { Keycap } from '../kit/Keycap.js';
import { Panel } from '../kit/Panel.js';
import { ScreenFrame } from './ScreenFrame.js';

const SECTIONS: readonly (readonly [title: string, keys: readonly (readonly [string, string])[]])[] = [
  [
    'Move',
    [
      ['j / k', 'Down / up'],
      ['g / G', 'Top / bottom'],
      ['enter', 'Open'],
      ['esc / q', 'Back'],
      ['h / l', 'Previous / next filter'],
      ['1–7', 'Jump to filter'],
    ],
  ],
  [
    'Tasks',
    [
      ['n', 'New task'],
      ['s', 'Status'],
      ['p', 'Priority (in a task)'],
      ['a', 'Assign'],
      ['c', 'Comment'],
      ['e', 'Edit any field'],
      ['d', 'Description'],
      ['m', 'Move to project'],
      ['t', 'Type'],
      ['r', 'Requester'],
      ['x', 'Done / reopen'],
    ],
  ],
  [
    'Projects (online)',
    [
      ['i', 'Configure/export project ticket API'],
      ['r', 'Link repository'],
      ['e', 'Edit project'],
    ],
  ],
  [
    'Git (in a task)',
    [
      ['b', 'Start / switch branch'],
      ['g', 'Git menu'],
      ['C', 'Commit (pick files)'],
    ],
  ],
  [
    'Chat (remote mode)',
    [
      ['#', 'Open the chat'],
      ['enter / alt+enter', 'Send / new line'],
      ['tab', '@ complete, or pick a message'],
      ['r / t', 'Reply / task from message'],
      ['e / d', 'Edit / delete yours'],
      ['ctrl+g', 'Pick / create channel'],
      ['[ ] / #', 'Switch channel'],
    ],
  ],
  [
    'Go to',
    [
      ['/', 'Search'],
      [': or ctrl+k', 'Commands'],
      ['p', 'Projects'],
      ['w', 'Workspaces'],
      ['f', 'Finance & performance (online)'],
      [',', 'Settings and global keyboard shortcuts'],
      ['u', 'My profile (online); username in the top bar is clickable'],
      ['A', 'Access approvals (CEO, remote mode)'],
      ['r', 'Link repo (in Projects)'],
    ],
  ],
  [
    'Mouse',
    [
      ['click', 'Select; again to open'],
      ['wheel', 'Scroll lists and chat'],
      ['click outside', 'Close a window'],
      ['shift+drag', 'Select text to copy'],
      ['M', 'Mouse on / off (remembered)'],
    ],
  ],
  [
    'General',
    [
      ['?', 'Help'],
      ['q', 'Quit (from home)'],
      ['ctrl+c', 'Quit now'],
    ],
  ],
];

export function HelpScreen() {
  const { width } = useLayout();
  const columns = width >= 118 ? 3 : width >= 76 ? 2 : 1;
  // Sections go to the shortest column, in order, so the columns end at similar heights.
  const groups: (typeof SECTIONS)[number][][] = Array.from({ length: columns }, () => []);
  const heights = Array.from({ length: columns }, () => 0);
  for (const section of SECTIONS) {
    const shortest = heights.indexOf(Math.min(...heights));
    groups[shortest]?.push(section);
    heights[shortest] = (heights[shortest] ?? 0) + section[1].length + 2;
  }
  const columnWidth = Math.floor((width - (columns - 1)) / columns);

  return (
    <ScreenFrame title={`${APP_NAME} Help`} aside={APP_DESCRIPTION} hints={[['esc', 'back']]}>
      <Box gap={1}>
        {groups.map((group, index) => (
          <Box key={index} flexDirection="column" width={columnWidth}>
            {group.map(([title, keys]) => (
              <Panel key={title} title={title}>
                {keys.map(([key, description]) => (
                  <Box key={key}>
                    <Box width={Math.max(...keys.map(([candidate]) => candidate.length)) + 4} flexShrink={0}>
                      <Keycap keys={key} />
                    </Box>
                    <Text color={palette.muted} wrap="truncate-end">
                      {description}
                    </Text>
                  </Box>
                ))}
              </Panel>
            ))}
          </Box>
        ))}
      </Box>
    </ScreenFrame>
  );
}
