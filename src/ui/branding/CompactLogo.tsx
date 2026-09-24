import { Text } from 'ink';
import { palette, symbols } from '../theme/theme.js';
import { APP_NAME } from './brand.js';

/** One-line mark: the name and the cursor that ends the full wordmark. */
export function CompactLogo() {
  return (
    <Text>
      <Text bold>{APP_NAME}</Text>
      <Text color={palette.accent}>{symbols.cursor}</Text>
    </Text>
  );
}
