'use client';

/**
 * PlayerShell — the home-v2 live players' one shell (owner decision, U-*
 * boards): the session list is the layer BEHIND the player; dragging the
 * player DOWN (or opening the list) shrinks it to a mini-player at the
 * bottom; dragging the mini-player up / tapping it brings the player back.
 *
 * For players that float over a map owned by someone else (MapShell's map
 * behind a transparent player): the behind layer is mounted only while the
 * list is open, so the map stays visible otherwise. Free run keeps its own
 * TwoLayerShell (its map lives INSIDE the draggable layer) and reuses the
 * MiniPlayer / SessionListLayer pieces only.
 *
 * Layout only: no timers, no store access.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';

export interface PlayerShellApi {
  /** Pointer-down handler for drag handles (ignores presses that start on a button). */
  startDrag: (e: React.PointerEvent) => void;
}

export interface PlayerShellProps {
  /** True = the session list is showing and the player is the mini bar. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The session list (rendered only while open). */
  behind: React.ReactNode;
  /** The mini-player; receives the drag handler + the measured safe-area bottom. */
  mini: (api: PlayerShellApi & { height: number; safeBottom: number }) => React.ReactNode;
  /** The full player. */
  children: (api: PlayerShellApi) => React.ReactNode;
  /** Mini bar height without the safe area. Default 72. */
  miniHeight?: number;
}

export default function PlayerShell({ open, onOpenChange, behind, mini, children, miniHeight = 72 }: PlayerShellProps) {
  const [winH, setWinH] = useState(typeof window !== 'undefined' ? window.innerHeight : 812);
  const [safeBottom, setSafeBottom] = useState(0);
  const safeRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (safeRef.current) setSafeBottom(safeRef.current.getBoundingClientRect().height);
  }, []);
  const miniY = winH - miniHeight - safeBottom;

  const onDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (!open && (info.offset.y > 100 || info.velocity.y > 500)) onOpenChange(true);
      else if (open && (info.offset.y < -50 || info.velocity.y < -500)) onOpenChange(false);
    },
    [open, onOpenChange],
  );
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragControls.start(e);
    },
    [dragControls],
  );

  return (
    <>
      {open && <div className="absolute inset-0 z-10 pointer-events-auto">{behind}</div>}

      <motion.div
        className="absolute inset-0 z-20 pointer-events-none"
        animate={{ y: open ? miniY : 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: open ? miniY + 120 : miniY }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        dir="rtl"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {open ? mini({ startDrag, height: miniHeight, safeBottom }) : children({ startDrag })}
      </motion.div>

      <div
        ref={safeRef}
        className="fixed bottom-0 left-0 w-0 pointer-events-none"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </>
  );
}
