import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { TextInput } from '../components/TextInput.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { OverlayFrame } from './OverlayFrame.js';
import type { PromptSpec } from './types.js';

export function completeFrom(value: string, suggestions: readonly string[]): string | null {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  const match = suggestions.find((suggestion) => suggestion.toLowerCase().startsWith(needle));
  return match && match !== value ? match : null;
}

export function PromptOverlay({ spec }: { spec: PromptSpec }) {
  const { closeOverlay, notify } = useAppState();
  const [value, setValue] = useState(spec.initial ?? '');
  const [busy, setBusy] = useState(false);
  const suggestions = spec.suggestions ?? [];
  const completion = completeFrom(value, suggestions);

  const submit = async () => {
    if (busy) return;
    if (!spec.allowEmpty && !value.trim()) {
      notify('Type something first.', 'error');
      return;
    }
    setBusy(true);
    const result = await spec.onSubmit(value);
    setBusy(false);
    if (result !== false) closeOverlay(spec);
  };

  useKeys(Layer.overlay, (_input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) void submit();
    else if (key.tab && completion) setValue(completion);
    return true;
  });

  const others = suggestions.filter((suggestion) => suggestion !== value).slice(0, 6);
  return (
    <OverlayFrame
      title={spec.title}
      context={spec.context}
      hints={[
        ['enter', 'save'],
        ...(suggestions.length ? ([['tab', 'complete']] as const) : []),
        ['esc', 'cancel'],
      ]}
    >
      <TextInput value={value} onChange={setValue} placeholder={spec.placeholder} />
      {completion ? (
        <Text dimColor>{`  tab → ${completion}`}</Text>
      ) : others.length ? (
        <Box marginTop={1}>
          <Text dimColor wrap="truncate-end">{`  known: ${others.join(', ')}`}</Text>
        </Box>
      ) : null}
    </OverlayFrame>
  );
}
