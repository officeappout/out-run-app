'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Put keyboard / TV-remote focus on an element when it mounts (the OK key then clicks it).
 * An explicit effect, not the `autoFocus` attribute: it is deliberate here, the screen's one primary action.
 */
export function useAutoFocus<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
