import { useMemo } from 'react';
import { AgentScene, type SceneId } from './index.js';
import { palette } from '../theme/theme.js';

/** The bundled scenes, recolored with SOJA's active light or dark palette. */
export function Mascot({ scene, paused = false }: { scene: SceneId; paused?: boolean }) {
  const colors = useMemo(() => ({
    agent: palette.accent,
    rock: palette.muted,
    soil: palette.faint,
    dirt: palette.warning,
    spark: palette.warning,
    fire: palette.danger,
    flame: palette.warning,
    water: palette.info,
    good: palette.success,
    bad: palette.danger,
    accent: palette.accent,
    cloud: palette.muted,
    wood: palette.warning,
    paper: palette.text,
    leaf: palette.success,
    text: palette.text,
  }), []);
  return <AgentScene scene={scene} palette={colors} fps={4} paused={paused} showStatus={false} />;
}
