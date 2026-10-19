'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Press-and-hold to confirm (the v2 players' stop control: a stray tap must
 * never end a workout). Returns 0–1 progress for a ring and pointer handlers;
 * releasing early cancels. Fires `onConfirm` once per hold.
 */
export function useHoldToConfirm(onConfirm: () => void, holdSeconds = 1.2) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  }, []);
  useEffect(() => cancel, [cancel]);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const p = Math.min(1, (Date.now() - startRef.current) / (holdSeconds * 1000));
    setProgress(p);
    if (p >= 1) {
      cancel();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([60]);
      confirmRef.current();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [cancel, holdSeconds]);

  const start = useCallback(() => {
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  return {
    progress,
    handlers: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
  };
}
