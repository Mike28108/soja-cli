import { Text } from 'ink';
import { useState } from 'react';
import { useKeys } from '../input/KeyProvider.js';
import { Layer } from '../input/dispatcher.js';
import { editText } from '../input/text-editing.js';
import { palette } from '../theme/theme.js';

interface TextInputProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string | undefined;
  active?: boolean;
  prompt?: string;
}

/**
 * Single-line field. Consumes editing keys only; Enter, Esc, Tab and ↑/↓
 * fall through to whoever owns the field.
 */
export function TextInput({ value, onChange, placeholder, active = true, prompt = '›' }: TextInputProps) {
  // Stored as distance from the end: when the owner replaces the value
  // (autocomplete), a cursor at the end stays at the end.
  const [fromEnd, setFromEnd] = useState(0);
  const cursor = Math.max(0, value.length - fromEnd);

  useKeys(
    Layer.input,
    (input, key) => {
      const next = editText({ value, cursor }, input, key);
      if (!next) return false;
      setFromEnd(next.value.length - next.cursor);
      if (next.value !== value) onChange(next.value);
      return true;
    },
    active,
  );

  const position = cursor;
  const showPlaceholder = !value && placeholder;
  return (
    <Text>
      <Text color={active ? palette.accent : undefined} dimColor={!active}>
        {prompt}{' '}
      </Text>
      {showPlaceholder ? (
        <>
          {active ? <Text inverse>{placeholder.slice(0, 1)}</Text> : null}
          <Text dimColor>{active ? placeholder.slice(1) : placeholder}</Text>
        </>
      ) : (
        <>
          <Text>{value.slice(0, position)}</Text>
          {active ? <Text inverse>{value.slice(position, position + 1) || ' '}</Text> : null}
          <Text>{active ? value.slice(position + 1) : value.slice(position)}</Text>
        </>
      )}
    </Text>
  );
}
