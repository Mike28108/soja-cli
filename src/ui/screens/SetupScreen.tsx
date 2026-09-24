import { Box, Text } from 'ink';
import { useState } from 'react';
import type { AppServices } from '../../application/services/index.js';
import type { Session } from '../../application/types.js';
import { slugify } from '../../domain/naming.js';
import { toDisplayError } from '../../utils/errors.js';
import { Splash } from '../branding/Splash.js';
import { TextInput } from '../components/TextInput.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';

type Step = 'displayName' | 'username' | 'workspaceName';
const STEPS: Step[] = ['displayName', 'username', 'workspaceName'];
const QUESTIONS: Record<Step, string> = {
  displayName: "What's your name?",
  username: 'Username',
  workspaceName: 'Workspace name',
};
const PLACEHOLDERS: Record<Step, string> = {
  displayName: 'Michael',
  username: 'michael',
  workspaceName: 'Bravos Development',
};

/** First run: three questions, then straight into SOJA. */
export function SetupScreen({ services, onDone }: { services: AppServices; onDone(session: Session): void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Step, string>>({ displayName: '', username: '', workspaceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = STEPS[step] ?? 'displayName';

  const advance = async () => {
    if (busy) return;
    if (!values[current].trim()) {
      setError('This one is required.');
      return;
    }
    setError(null);
    if (current === 'displayName' && !values.username) {
      // Suggest a username from the name; it stays editable.
      setValues((previous) => ({ ...previous, username: slugify(previous.displayName).replace(/-/g, '') }));
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      onDone(await services.session.setup(values));
    } catch (failure) {
      setError(toDisplayError(failure).message);
      setBusy(false);
    }
  };

  useKeys(Layer.screen, (_input, key) => {
    if (key.return) void advance();
    else if (key.escape && step > 0) {
      setError(null);
      setStep(step - 1);
    } else return false;
    return true;
  });

  return (
    <Box flexDirection="column">
      <Splash />
      <Box marginTop={1} flexDirection="column">
        <Text bold>First setup</Text>
        <Text dimColor>Three questions and you are in. Everything stays on this machine.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {STEPS.map((name, index) => (
          <Box key={name}>
            <Box width={20}>
              <Text color={index === step ? palette.accent : undefined} dimColor={index > step}>
                {index < step ? `${symbols.check} ` : '  '}
                {QUESTIONS[name]}
              </Text>
            </Box>
            {index === step ? (
              <TextInput
                value={values[name]}
                onChange={(value) => setValues((previous) => ({ ...previous, [name]: value }))}
                placeholder={PLACEHOLDERS[name]}
              />
            ) : (
              <Text dimColor={index < step}>{index < step ? values[name] : ''}</Text>
            )}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        {error ? (
          <Text color={palette.danger}>{`${symbols.cross} ${error}`}</Text>
        ) : (
          <Text dimColor>{busy ? 'Setting things up…' : `enter ${step === STEPS.length - 1 ? 'finish' : 'next'}   esc back   ctrl+c quit`}</Text>
        )}
      </Box>
    </Box>
  );
}
