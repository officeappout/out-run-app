'use client';

/**
 * RunMetricsDrawer — the run / walk players' metrics as a drawer the runner
 * controls (enable_run_player_drawer_v1; owner 21.10): `full` = today's live
 * card, `compact` = the mini line (RunDrawerCompact). Drag the handle (or the
 * compact bar) down: full → compact → the session list behind (the shell's
 * existing behaviour, via onOpenList). Up / tap: back to full.
 *
 * The wrapper is the one the player measures for the map camera
 * (usePublishedPlayerChrome's cardRef, drawer: true) — its layout height
 * changes with the snap, so the follow camera keeps the runner's marker just
 * above whichever snap is showing. The drag offset is a transform and springs
 * back to the origin on release (layout untouched while dragging).
 *
 * Shared by free run / route / walk (FreeRunOverlayV2), planned intervals
 * (PlannedRunLiveV2) and continuous runs (ContinuousRunLiveV2).
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import RunDrawerCompact, { type RunDrawerCompactProps } from './RunDrawerCompact';
import {
  getRememberedDrawerSnap,
  rememberDrawerSnap,
  resolveDrawerGesture,
  toggleDrawerSnap,
  type RunDrawerSnap,
} from './run-drawer-logic';

export interface RunMetricsDrawerProps {
  /** Today's full live card. */
  full: React.ReactNode;
  /** The compact line's data. */
  compact: RunDrawerCompactProps;
  /** Hand over to the shell: open the session list (player → mini bar). */
  onOpenList: () => void;
  /** usePublishedPlayerChrome's cardRef. */
  cardRef: (node: HTMLDivElement | null) => void;
  /** px between the safe-area bottom and the drawer (matches the chrome's bottomGapPx). */
  bottomGapPx: number;
  /** Extra classes for the positioned wrapper (z-index). */
  className?: string;
}

export default function RunMetricsDrawer({ full, compact, onOpenList, cardRef, bottomGapPx, className = '' }: RunMetricsDrawerProps) {
  const t = useT(player);
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const [snap, setSnapState] = useState<RunDrawerSnap>(getRememberedDrawerSnap);
  const dragged = useRef(false);

  const setSnap = useCallback((next: RunDrawerSnap) => {
    rememberDrawerSnap(next);
    setSnapState(next);
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button:not([data-drawer-handle])')) return;
      dragged.current = false;
      controls.start(e);
    },
    [controls],
  );

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const action = resolveDrawerGesture(snap, info.offset.y, info.velocity.y);
      if (action.type === 'snap') setSnap(action.snap);
      else if (action.type === 'openList') onOpenList();
    },
    [snap, setSnap, onOpenList],
  );

  const toggle = () => {
    if (dragged.current) return;
    setSnap(toggleDrawerSnap(snap));
  };

  const isFull = snap === 'full';

  return (
    <div
      ref={cardRef}
      className={`absolute inset-x-3 ${className}`}
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)` }}
      data-run-drawer={snap}
      role="region"
      aria-label={t('run.drawer.handleAria')}
    >
      <motion.div
        className="pointer-events-none"
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 0.35 }}
        dragSnapToOrigin
        dragMomentum={false}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={onDragEnd}
      >
        {/* Grab handle — drag zone + tap to toggle. */}
        <div className="flex justify-center">
          <button
            type="button"
            data-drawer-handle
            onPointerDown={startDrag}
            onClick={toggle}
            aria-label={isFull ? t('run.drawer.collapseAria') : t('run.drawer.expandAria')}
            aria-expanded={isFull}
            className="pointer-events-auto flex h-6 w-24 items-center justify-center"
            style={{ touchAction: 'none' }}
          >
            <span className="block h-[5px] w-10 rounded-full bg-white shadow-v2-ring" aria-hidden />
          </button>
        </div>

        <motion.div
          key={snap}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {isFull ? (
            full
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label={t('run.drawer.expandAria')}
              className="pointer-events-auto cursor-pointer"
              style={{ touchAction: 'none' }}
              onPointerDown={startDrag}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSnap('full');
                }
              }}
            >
              <RunDrawerCompact {...compact} />
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
