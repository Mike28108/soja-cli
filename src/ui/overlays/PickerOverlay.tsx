import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { TextField } from '../components/TextField.js';
import { useList } from '../hooks/use-list.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Clickable } from '../kit/Clickable.js';
import { ScrollBar } from '../kit/ScrollBar.js';
import { palette, symbols, toneColors } from '../theme/theme.js';
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
  const height = Math.min(14, useOverlayHeight() - (spec.filterable ? 3 : 0));

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
  const labelWidth = Math.max(8, ...items.map((option) => option.label.length)) + 2;
  const hintWidth = Math.max(0, ...items.map((option) => option.hint?.length ?? 0));
  // Wide enough for the options and, when possible, for the title and context on one line.
  const width = Math.min(96, Math.max(44, labelWidth + hintWidth + 14, (spec.context?.length ?? 0) + spec.title.length + 12));
  return (
    <OverlayFrame
      title={spec.title}
      context={spec.context}
      width={width}
      hints={[
        ['↑↓', 'move'],
        ['enter', 'select'],
        ...(spec.filterable ? [] : ([['1-9', 'pick']] as const)),
        ['esc', 'cancel'],
      ]}
    >
      {spec.filterable ? (
        <Box marginBottom={1}>
          <TextField
            value={query}
            onChange={(next) => {
              setQuery(next);
              list.select(0);
            }}
            placeholder="Type to filter"
          />
        </Box>
      ) : null}
      {items.length === 0 ? <Text color={palette.faint}>No matches.</Text> : null}
      <Box>
        <Clickable onWheel={(direction) => list.select(list.index + direction)} layer={Layer.overlay} flexDirection="column" flexGrow={1}>
          {visible.map((option, position) => {
            const index = list.offset + position;
            const selected = index === list.index;
            const current = option.value === spec.initial;
            const bg = selected ? { backgroundColor: palette.selection } : {};
            const tone = option.tone ? toneColors(option.tone).fg : undefined;
            const color = option.value === CREATE ? palette.accent : option.dim ? palette.muted : (tone ?? palette.text);
            return (
              <Clickable key={option.value} onClick={() => void choose(option)} layer={Layer.overlay}>
                <Box flexGrow={1} {...bg}>
                  <Text color={palette.accent} {...bg}>
                    {selected ? `${symbols.pointer} ` : '  '}
                  </Text>
                  {!spec.filterable ? <Text color={palette.faint} {...bg}>{index < 9 ? `${index + 1} ` : '  '}</Text> : null}
                  <Box width={labelWidth} flexShrink={0}>
                    <Text color={color} bold={selected} {...bg}>
                      {option.label}
                    </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    {option.hint ? (
                      <Text color={palette.muted} wrap="truncate-middle" {...bg}>
                        {option.hint}
                      </Text>
                    ) : null}
                  </Box>
                  {current ? <Text color={palette.accent} {...bg}>{` ${symbols.check} `}</Text> : null}
                </Box>
              </Clickable>
            );
          })}
        </Clickable>
        <ScrollBar total={items.length} visible={height} offset={list.offset} height={Math.min(height, items.length)} />
      </Box>
    </OverlayFrame>
  );
}
