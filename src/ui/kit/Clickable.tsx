import { Box, type DOMElement } from 'ink';
import { useRef, type ReactNode } from 'react';
import { Layer } from '../input/dispatcher.js';
import { useClickable } from '../input/KeyProvider.js';
import type { MouseEvent, Rect } from '../input/mouse.js';

interface ClickableProps {
  onClick?: ((event: MouseEvent, rect: Rect) => void) | undefined;
  onWheel?: ((direction: 1 | -1) => void) | undefined;
  layer?: Layer;
  active?: boolean;
  children: ReactNode;
  flexGrow?: number;
  flexShrink?: number;
  width?: number | string;
  flexDirection?: 'row' | 'column';
}

/** Wraps anything that reacts to the mouse. Inactive screens (hidden or under a window) ignore it. */
export function Clickable({ onClick, onWheel, layer = Layer.screen, active = true, children, ...box }: ClickableProps) {
  const ref = useRef<DOMElement>(null);
  useClickable(
    ref,
    {
      ...(onClick ? { onClick } : {}),
      ...(onWheel ? { onWheel: (direction) => onWheel(direction) } : {}),
    },
    { layer, active: active && Boolean(onClick || onWheel) },
  );
  return (
    <Box ref={ref} {...box}>
      {children}
    </Box>
  );
}
