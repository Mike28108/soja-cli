import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { TextInput } from '../components/TextInput.js';
import { useList } from '../hooks/use-list.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { OverlayFrame, useOverlayHeight } from './OverlayFrame.js';
import type { PickerOption, PickerSpec } from './types.js';

const CREATE = '__create__';

export function matchOptions(options: readonly PickerOption[], query: string): PickerOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...options];
  return options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(needle));
}

export function PickerOverlay({ spec }: { spec: PickerSpec }) {
  const { closeOverlay } = useAppState();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const height = useOverlayHeight() - (spec.filterable ? 2 : 0);

  const matches = matchOptions(spec.options, query);
  const canCreate = Boolean(spec.create && query.trim() && matches.length === 0);
  const items: PickerOption[] = canCreate && spec.create ? [{ value: CREATE, label: spec.create.label(query.trim()) }] : matches;

  const initialIndex = Math.max(0, spec.options.findIndex((option) => option.value === spec.initial));
  const list = useList(items.length, height, !spec.filterable, initialIndex);

  const choose = async (option: PickerOption | undefined) => {
    if (!option || busy) return;
    setBusy(true);
    const result =
      option.value === CREATE && spec.create ? await spec.create.onCreate(query.trim()) : await spec.onSelect(option.value);
    setBusy(false);
    if (result !== false) closeOverlay(spec);
  };

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) void choose(items[list.index]);
    else if (list.handleKey(input, key)) return true;
    else if (!spec.filterable && /^[1-9]$/.test(input)) void choose(items[Number(input) - 1]);
    return true; // modal: nothing below reacts while a picker is open
  });

  const visible = items.slice(list.offset, list.offset + height);
  const labelWidth = Math.max(...items.map((option) => option.label.length)) + 2;
  return (
    <OverlayFrame
      title={spec.title}
      context={spec.context}
      hints={[
        [spec.filterable ? '↑/↓' : 'j/k', 'move'],
        ['enter', 'select'],
        ...(spec.filterable ? [] : ([['1-9', 'pick']] as const)),
        ['esc', 'cancel'],
      ]}
    >
      {spec.filterable ? (
        <Box marginBottom={1}>
          <TextInput
            value={query}
            onChange={(next) => {
              setQuery(next);
              list.select(0);
            }}
            placeholder="Type to filter"
          />
        </Box>
      ) : null}
      {items.length === 0 ? <Text dimColor>  No matches.</Text> : null}
      {visible.map((option, position) => {
        const index = list.offset + position;
        const selected = index === list.index;
        const current = option.value === spec.initial;
        return (
          <Box key={option.value} gap={1}>
            <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
            {!spec.filterable ? <Text dimColor>{index < 9 ? String(index + 1) : ' '}</Text> : null}
            <Box width={labelWidth}>
              <Text color={option.value === CREATE ? palette.accent : option.color} dimColor={option.dim} bold={selected}>
                {option.label}
              </Text>
            </Box>
            {option.hint ? <Text dimColor>{option.hint}</Text> : null}
            {current ? <Text color={palette.accent}>{symbols.active}</Text> : null}
          </Box>
        );
      })}
    </OverlayFrame>
  );
}
