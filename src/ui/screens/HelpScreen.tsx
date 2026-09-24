import { Box, Text } from 'ink';
import { APP_DESCRIPTION, APP_NAME } from '../branding/brand.js';
import { useLayout } from '../hooks/use-layout.js';
import { palette } from '../theme/theme.js';
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
    'Git (in a task)',
    [
      ['b', 'Start / switch branch'],
      ['g', 'Git menu'],
      ['C', 'Commit (pick files)'],
    ],
  ],
  [
    'Go to',
    [
      ['/', 'Search'],
      [': or ctrl+k', 'Commands'],
      ['p', 'Projects'],
      ['w', 'Workspaces'],
      ['r', 'Link repo (in Projects)'],
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
  const columns = width >= 90 ? 2 : 1;
  const perColumn = Math.ceil(SECTIONS.length / columns);
  const groups = Array.from({ length: columns }, (_, index) => SECTIONS.slice(index * perColumn, (index + 1) * perColumn));

  return (
    <ScreenFrame hints={[['esc', 'back']]}>
      <Text>
        <Text bold>{`${APP_NAME} Help`}</Text>
        <Text dimColor>{`  ${APP_DESCRIPTION}`}</Text>
      </Text>
      <Box marginTop={1} gap={6}>
        {groups.map((group, index) => (
          <Box key={index} flexDirection="column">
            {group.map(([title, keys]) => (
              <Box key={title} flexDirection="column" marginBottom={1}>
                <Text bold>{title}</Text>
                {keys.map(([key, description]) => (
                  <Box key={key}>
                    <Box width={16}>
                      <Text color={palette.accent}>{`  ${key}`}</Text>
                    </Box>
                    <Text dimColor>{description}</Text>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </ScreenFrame>
  );
}
