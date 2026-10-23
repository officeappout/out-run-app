'use client';

/**
 * WideSplit — the wide (landscape / tablet / desktop / TV) player layout
 * (enable_wide_player_v1): the exercise media big on the inline-start side
 * (contained, never cropped) on a LIGHT surface, and a SIDE DRAWER on the other
 * side — flush to the screen edge, corners rounded on the video side, with a
 * drag / tap handle that collapses it (same language as the bottom drawers).
 * Optional footer row (the "together" presence rail). ~5% safe margins
 * (TV overscan), a visible focus ring on every button.
 * Layout only — no timers, no store access.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useWidePlayer } from './WidePlayerContext';

export interface WideSplitProps {
  media: React.ReactNode;
  panel: React.ReactNode;
  /** Horizontal row under both (presence rail). */
  footer?: React.ReactNode;
}

export const WIDE_FOCUS_RING =
  '[&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-4 [&_button:focus-visible]:ring-v2-accent [&_button:focus-visible]:ring-offset-2';

/** The side panel's scroll + scale frame: content designed for ~360px is zoomed to the panel. */
export function WidePanel({ children }: { children: React.ReactNode }) {
  const { scale } = useWidePlayer();
  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain" data-wide-panel-scroll="">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full px-5 py-4" style={{ zoom: scale }}>
          {children}
        </div>
      </div>
    </div>
  );
}

let rememberedCollapsed = false;

/** Handle on the drawer's video-side edge: tap, or drag toward the screen edge to collapse / away to expand. */
function SideDrawerHandle({ collapsed, onToggle, onSet }: { collapsed: boolean; onToggle: () => void; onSet: (c: boolean) => void }) {
  const t = useT(player);
  return (
    <motion.button
      type="button"
      data-wide-handle=""
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('wide.panel.expand') : t('wide.panel.collapse')}
      onClick={onToggle}
      onPanEnd={(e, info) => {
        const rtl = typeof window !== 'undefined' && getComputedStyle(e.target as Element).direction === 'rtl';
        const towardEdge = rtl ? info.offset.x < -40 : info.offset.x > 40;
        const awayFromEdge = rtl ? info.offset.x > 40 : info.offset.x < -40;
        if (towardEdge) onSet(true);
        else if (awayFromEdge) onSet(false);
      }}
      className="absolute top-1/2 z-10 flex h-20 w-7 -translate-y-1/2 items-center justify-center"
      style={{ insetInlineStart: -22, touchAction: 'none' }}
    >
      <span className="block h-10 w-1.5 rounded-full bg-v2-pill-border" aria-hidden />
    </motion.button>
  );
}

export default function WideSplit({ media, panel, footer }: WideSplitProps) {
  const [collapsed, setCollapsedState] = useState(rememberedCollapsed);
  const setCollapsed = (c: boolean) => {
    rememberedCollapsed = c;
    setCollapsedState(c);
  };
  const block = {
    marginTop: 'max(5vh, calc(env(safe-area-inset-top, 0px) + 5.5rem))',
    marginBottom: 'max(5vh, env(safe-area-inset-bottom, 0px))',
  };
  return (
    <div
      data-wide-split=""
      className={`absolute inset-0 flex flex-col bg-v2-surface ${WIDE_FOCUS_RING}`}
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="flex min-h-0 flex-1">
        <div
          data-wide-media=""
          className="relative min-w-0 flex-1 overflow-hidden rounded-3xl bg-black"
          style={{ ...block, marginInlineStart: 'max(5vw, env(safe-area-inset-left, 0px))', marginInlineEnd: '2.5vmin' }}
        >
          {media}
        </div>
        <div
          data-wide-panel=""
          data-collapsed={collapsed ? 'true' : 'false'}
          aria-hidden={collapsed}
          className="relative shrink-0 transition-[width] duration-300 ease-v2"
          style={{ ...block, width: collapsed ? 0 : '38%' }}
        >
          <SideDrawerHandle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onSet={setCollapsed} />
          <div
            className="absolute inset-0 overflow-hidden bg-white shadow-v2-sheet"
            style={{ borderStartStartRadius: 28, borderEndStartRadius: 28 }}
          >
            <WidePanel>{panel}</WidePanel>
          </div>
        </div>
      </div>
      {footer && (
        <div data-wide-footer="" className="mb-[2vmin] flex flex-none flex-row items-center justify-center gap-3 overflow-x-auto">
          {footer}
        </div>
      )}
    </div>
  );
}
