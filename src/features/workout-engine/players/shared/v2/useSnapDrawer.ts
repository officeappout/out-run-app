'use client';

/**
 * useSnapDrawer — state for a two-snap player drawer (full ↔ compact).
 * Off (enabled = false) it always reports `full`, so callers render today's
 * layout. The snap is remembered per key for the app session (the card
 * remounts on every exercise / phase, the choice must survive that).
 */

import { useCallback, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import {
  getRememberedSnap,
  rememberSnap,
  resolveSnapGesture,
  toggleDrawerSnap,
  type SnapDrawerSnap,
} from './snap-drawer-logic';

const CLICK_AFTER_PAN_MS = 300;

export interface SnapDrawerState {
  snap: SnapDrawerSnap;
  collapsed: boolean;
  setSnap: (snap: SnapDrawerSnap) => void;
  /** Tap on the grabber / compact bar — ignored right after a drag. */
  toggle: () => void;
  onPanStart: () => void;
  onPanEnd: (e: unknown, info: PanInfo) => void;
}

export function useSnapDrawer(key: string, enabled: boolean): SnapDrawerState {
  const [snapState, setSnapState] = useState<SnapDrawerSnap>(() => getRememberedSnap(key));
  // A tap right after a drag is the drag's own click — ignore it.
  const panEndedAt = useRef(0);
  const snap: SnapDrawerSnap = enabled ? snapState : 'full';

  const setSnap = useCallback(
    (next: SnapDrawerSnap) => {
      rememberSnap(key, next);
      setSnapState(next);
    },
    [key],
  );

  const toggle = useCallback(() => {
    if (Date.now() - panEndedAt.current < CLICK_AFTER_PAN_MS) return;
    setSnap(toggleDrawerSnap(snap));
  }, [snap, setSnap]);

  const onPanStart = useCallback(() => {
    panEndedAt.current = Date.now();
  }, []);

  const onPanEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const next = resolveSnapGesture(snap, info.offset.y, info.velocity.y);
      panEndedAt.current = Date.now();
      if (next) setSnap(next);
    },
    [snap, setSnap],
  );

  return { snap, collapsed: snap === 'compact', setSnap, toggle, onPanStart, onPanEnd };
}
