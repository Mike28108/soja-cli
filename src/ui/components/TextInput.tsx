import { Text } from 'ink';
import { useState } from 'react';
import { useKeys } from '../input/KeyProvider.js';
import { Layer } from '../input/dispatcher.js';
import { editText } from '../input/text-editing.js';
import { palette, symbols } from '../theme/theme.js';

interface TextInputProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string | undefined;
  active?: boolean;
  prompt?: string;
  /** Shows one dot per character instead of the text (secrets). */
  mask?: boolean;
}

/**
 * Single-line field. Consumes editing keys only; Enter, Esc, Tab and ↑/↓
 * fall through to whoever owns the field.
 */
export function TextInput({ value: actual, onChange, placeholder, active = true, prompt = '›', mask = false }: TextInputProps) {
  const value = actual;
  // Same length as the text, so the cursor lands on the same place.
  const shown = mask ? symbols.secret.repeat(actual.length) : actual;
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
          <Text>{shown.slice(0, position)}</Text>
          {active ? <Text inverse>{shown.slice(position, position + 1) || ' '}</Text> : null}
          <Text>{active ? shown.slice(position + 1) : shown.slice(position)}</Text>
        </>
      )}
    </Text>
  );
}
