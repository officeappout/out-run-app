'use client';

/**
 * WideSplit — the wide (landscape / tablet / desktop / TV) player layout
 * (enable_wide_player_v1), RTL: the exercise media big on the RIGHT (contained,
 * never cropped), a side panel on the LEFT that replaces the bottom sheet, and
 * an optional footer row (the "together" presence rail). ~5% safe margins on
 * every side (TV overscan), a visible focus ring on every button.
 * Layout only — no timers, no store access.
 */

import React from 'react';
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

export default function WideSplit({ media, panel, footer }: WideSplitProps) {
  return (
    <div
      data-wide-split=""
      className={`absolute inset-0 flex flex-col bg-black ${WIDE_FOCUS_RING}`}
      style={{
        fontFamily: 'var(--font-simpler)',
        paddingInline: 'max(5vw, env(safe-area-inset-left, 0px))',
        paddingTop: 'max(5vh, calc(env(safe-area-inset-top, 0px) + 5.5rem))',
        paddingBottom: 'max(5vh, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex min-h-0 flex-1 gap-[2.5vmin]">
        <div data-wide-media="" className="relative min-w-0 flex-[62] overflow-hidden rounded-3xl bg-black">
          {media}
        </div>
        <div data-wide-panel="" className="relative min-w-0 flex-[38] overflow-hidden rounded-3xl bg-white">
          <WidePanel>{panel}</WidePanel>
        </div>
      </div>
      {footer && (
        <div data-wide-footer="" className="mt-[2vmin] flex flex-none flex-row items-center justify-center gap-3 overflow-x-auto">
          {footer}
        </div>
      )}
    </div>
  );
}
