import { Text } from 'ink';
import { APP_VERSION } from './brand.js';

export function VersionBadge() {
  return <Text dimColor>v{APP_VERSION}</Text>;
}
