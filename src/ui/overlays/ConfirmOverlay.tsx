import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Button } from '../kit/Button.js';
import { palette } from '../theme/theme.js';
import { wrapText } from '../../utils/text.js';
import { OverlayFrame, useOverlayWidth } from './OverlayFrame.js';
import type { ConfirmSpec } from './types.js';

const WIDTH = 60;

export function ConfirmOverlay({ spec }: { spec: ConfirmSpec }) {
  const { closeOverlay } = useAppState();
  // 0 = Cancel (the default), 1 = the action.
  const [choice, setChoice] = useState<0 | 1>(0);
  const inner = useOverlayWidth(WIDTH);

  const confirm = async () => {
    const result = await spec.onConfirm();
    if (result !== false) closeOverlay(spec);
  };
  const decide = (yes: boolean) => (yes ? void confirm() : closeOverlay(spec));

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape || input === 'n' || input === '1') decide(false);
    else if (input === 'y' || input === '2') decide(true);
    else if (key.leftArrow || key.rightArrow || key.tab || input === 'h' || input === 'l') setChoice(choice === 0 ? 1 : 0);
    else if (key.return) decide(choice === 1);
    return true;
  });

  return (
    <OverlayFrame
      title={spec.title}
      context={spec.context}
      width={WIDTH}
      hints={[
        ['←→', 'choose'],
        ['enter', choice === 1 ? spec.confirmLabel : 'cancel'],
        ['y/n', 'answer'],
        ['esc', 'cancel'],
      ]}
    >
      {spec.message
        ? wrapText(spec.message, inner).map((line, index) => (
            <Text key={index} color={palette.text}>
              {line}
            </Text>
          ))
        : null}
      <Box marginTop={spec.message ? 1 : 0} justifyContent="flex-end" gap={2}>
        <Button label="Cancel" focused={choice === 0} onPress={() => decide(false)} />
        <Button label={spec.confirmLabel} tone={spec.tone ?? 'success'} focused={choice === 1} onPress={() => decide(true)} />
      </Box>
    </OverlayFrame>
  );
}
