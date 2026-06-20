'use client';

/**
 * TwoLayerShell — generic BASE/TOP two-layer drag skeleton.
 *
 * Implements the Spotify-style draggable-layer pattern shared across all
 * running modes (and eventually strength). Callers supply content via props;
 * the shell owns the framer-motion mechanics.
 *
 *   BASE (z-0) — behindContent: always mounted, opacity-toggled,
 *               revealed as the TOP drags down toward minimizedY.
 *
 *   TOP  (z-10) — motion.div: drags y=0..minimizedY.
 *                 Caller content lives here (AppMap, overlays, etc.).
 *
 *   MINI (z-20) — absolute top-0, height=dockH, bg-black, rounded-t-2xl.
 *                 Visible when isMinimized=true; holds miniContent.
 *                 The MiniDock chevron + pointer-down drag handle live here.
 *
 * Props:
 *   dockH        — collapsed dock height in px (56 running / 72 strength).
 *   isActive     — false → drag disabled, layer resets to expanded.
 *   behindContent — JSX for the BASE layer (e.g. <RunLapsList />).
 *   miniContent  — JSX inside the MINI strip (e.g. <RunMiniDockContent isLapsOpen />).
 *   children     — render-prop; receives { dragControls, isMinimized, onExpand }.
 *
 * StrengthRunner adopts this shell in a future checkpoint. Today only
 * FreeRunLayer uses it; StrengthRunner keeps its inline motion.div as-is.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useLayerDrag, type LayerDragApi } from '../hooks/useLayerDrag';

// ─────────────────────────────────────────────────────────────────────────────

export interface TwoLayerShellRenderProps {
  /** Framer-motion drag controls — pass to the story bar's onPointerDown. */
  dragControls: LayerDragApi['dragControls'];
  /** True when the TOP LAYER has snapped to minimizedY (mini-dock state). */
  isMinimized: boolean;
  /** Expand back to y=0 — equivalent to setIsMinimized(false). */
  onExpand: () => void;
}

interface TwoLayerShellProps {
  /** Collapsed dock height in px (56 running / 72 strength). */
  dockH: number;
  /** When false, drag is disabled and the layer resets to expanded. */
  isActive?: boolean;
  /**
   * Tailwind bg-class for the BASE layer container (default: 'bg-white').
   * Callers supply their own: StrengthRunner passes 'bg-zinc-900', etc.
   * Needed so the BASE has a solid background when the TOP drags away.
   */
  behindBg?: string;
  /** Content rendered in the BASE layer behind the draggable TOP. */
  behindContent: React.ReactNode;
  /**
   * Render-prop for the MINI strip (shown when isMinimized=true).
   * Receives { onExpand } so the caller can wire an expand button without
   * coupling to Shell internals. The caller wraps in MiniDock, MiniPlayerBar,
   * or any custom component — Shell is agnostic.
   */
  miniContent: (api: { onExpand: () => void }) => React.ReactNode;
  /** TOP LAYER content — render-prop receives drag controls + minimized state. */
  children: (props: TwoLayerShellRenderProps) => React.ReactNode;
}

export default function TwoLayerShell({
  dockH,
  isActive,
  behindBg = 'bg-white',
  behindContent,
  miniContent,
  children,
}: TwoLayerShellProps) {
  const { dragControls, isMinimized, setIsMinimized, minimizedY, handleDragEnd } =
    useLayerDrag(dockH, isActive);

  const onExpand = React.useCallback(() => setIsMinimized(false), [setIsMinimized]);

  return (
    <div className="absolute inset-0 z-10 overflow-hidden">

      {/* ── BASE LAYER ────────────────────────────────────────────────────────
          Sits at z-0 behind the TOP. Revealed as the TOP drags down.
          opacity toggles immediately so content is visible during the drag
          (not just after release). Safe-area padding keeps content from
          hiding under the status bar (top) and MiniDock (bottom). */}
      <div
        className={`absolute inset-0 z-0 ${behindBg}`}
        style={{
          opacity: isActive ? 1 : 0,
          pointerEvents: isActive && isMinimized ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
        }}
        aria-hidden={!(isActive && isMinimized)}
      >
        <div
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: `calc(${dockH}px + env(safe-area-inset-bottom, 0px))`,
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {behindContent}
        </div>
      </div>

      {/* ── TOP LAYER — motion.div ────────────────────────────────────────────
          The draggable unit. Everything inside (AppMap + overlays) moves
          together as one surface. drag disabled when isActive=false so the
          map can be panned freely in browse mode. */}
      <motion.div
        className="absolute inset-0 z-10"
        drag={isActive ? 'y' : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: minimizedY }}
        dragElastic={0.12}
        dragMomentum={false}
        animate={{ y: isActive && isMinimized ? minimizedY : 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onDragEnd={isActive ? handleDragEnd : undefined}
      >
        {/* Caller content (AppMap + workout overlays + browse UI) */}
        {children({ dragControls, isMinimized, onExpand })}

        {/* ── MINI STRIP ──────────────────────────────────────────────────────
            absolute top-0 inside motion.div — sits at the physical bottom of
            the screen when motion.div is at y=minimizedY (winH − dockH).
            rounded-t-2xl matches StrengthRunner's MiniPlayerBar corner radius.
            miniContent is a render-prop; the caller supplies its own component
            (MiniDock, MiniPlayerBar, or custom) — Shell has no opinion. */}
        {isMinimized && (
          <div
            className="absolute top-0 left-0 right-0 z-20 bg-black rounded-t-2xl pointer-events-auto"
            style={{ height: dockH }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              dragControls.start(e);
            }}
          >
            {miniContent({ onExpand })}
          </div>
        )}
      </motion.div>

    </div>
  );
}
