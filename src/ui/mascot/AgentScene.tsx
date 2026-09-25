import { memo, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { Canvas } from './engine.js';
import { SCENES, type SceneId } from './scenes/index.js';
import { defaultPalette, type Palette } from './palette.js';

export interface AgentSceneProps {
  /** Escena a mostrar. */
  scene: SceneId;
  /** Fotogramas por segundo (por defecto 10, igual que la versión web). */
  fps?: number;
  /** Congela la animación en el fotograma actual. */
  paused?: boolean;
  /** Muestra la línea de estado debajo de la escena. */
  showStatus?: boolean;
  /** Texto propio para la línea de estado (reemplaza el de la escena). */
  statusText?: string;
  /** Sobrescribe colores por tono, p. ej. { agent: '#7F77DD' }. */
  palette?: Partial<Palette>;
  /** Semilla del azar; misma semilla = misma animación. */
  seed?: number;
}

/**
 * Escena ASCII animada de mini agentes para Ink.
 *
 * <AgentScene scene="working" />
 */
export const AgentScene = memo(function AgentScene({
  scene,
  fps = 10,
  paused = false,
  showStatus = true,
  statusText,
  palette,
  seed,
}: AgentSceneProps) {
  const def = SCENES[scene];
  const runtime = useMemo(() => def.create(seed), [def, seed]);
  const colors = useMemo(() => ({ ...defaultPalette, ...palette }), [palette]);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      runtime.step();
      setFrame((f) => f + 1);
    }, Math.max(16, Math.round(1000 / fps)));
    return () => clearInterval(id);
  }, [runtime, fps, paused]);

  const canvas = new Canvas(def.width, def.height);
  runtime.draw(canvas);
  const rows = canvas.rows();

  return (
    <Box flexDirection="column" width={def.width}>
      {rows.map((row, y) => (
        <Text key={y} wrap="truncate">
          {row.map((seg, i) =>
            seg.tone ? (
              <Text key={i} color={colors[seg.tone]}>
                {seg.text}
              </Text>
            ) : (
              seg.text
            ),
          )}
        </Text>
      ))}
      {showStatus && (
        <Text dimColor wrap="truncate">
          {statusText ?? runtime.status()}
        </Text>
      )}
    </Box>
  );
});
