'use client';

/**
 * TimedCardShell — the white bottom card of the timed player (boards A-2b,
 * A-4b): grabber, an optional coloured eyebrow, the caller's content.
 * enable_strength_drawer_v1: with `drawer` + `compact` the grabber drags /
 * taps between the full card and the caller's compact row.
 */
import React from 'react';
import PlayerDrawerBody from '../../../shared/v2/PlayerDrawerBody';
import type { SnapDrawerState } from '../../../shared/v2/useSnapDrawer';
import { useWidePlayer } from '../../../shared/v2/WidePlayerContext';
import WideKeyHints from '../../../shared/v2/WideKeyHints';

import { useUiDir } from '@/lib/i18n/useUiDir';
export interface TimedCardShellProps {
  eyebrow?: string | null;
  /** Orange eyebrow (last seconds). */
  warn?: boolean;
  children: React.ReactNode;
  /** enable_strength_drawer_v1: the two-snap drawer + this card's compact row. Absent = today's card. */
  drawer?: SnapDrawerState | null;
  compact?: React.ReactNode;
}

export default function TimedCardShell({ eyebrow, warn = false, children, drawer = null, compact = null }: TimedCardShellProps) {
  const { direction } = useUiDir();
  // enable_wide_player_v1: the card IS the side panel's content (WideSplit frames it) — no sheet, no drawer.
  const { wide } = useWidePlayer();
  if (wide) {
    return (
      <div data-wide-timed-card="" className="w-full" style={{ fontFamily: 'var(--font-simpler)' }}>
        {eyebrow && (
          <div className="mb-2 flex justify-center">
            <span className={`truncate whitespace-nowrap text-[16px] font-extrabold tabular-nums ${warn ? 'text-[#ea580c]' : 'text-v2-deep'}`}>{eyebrow}</span>
          </div>
        )}
        {children}
        <WideKeyHints />
      </div>
    );
  }
  return (
    <div
      dir={direction}
      className="absolute inset-x-0 bottom-0 z-10 rounded-t-[28px] bg-white px-5 pt-2 shadow-v2-sheet"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', fontFamily: 'var(--font-simpler)' }}
    >
      <PlayerDrawerBody
        drawer={drawer}
        compact={compact}
        fallbackGrabber={
          <div className="mb-1.5 flex justify-center">
            <div className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
          </div>
        }
      >
      {eyebrow && (
        <div className="mb-1 flex justify-center">
          <span
            className={`truncate whitespace-nowrap text-[12.5px] font-extrabold tabular-nums ${warn ? 'text-[#ea580c]' : 'text-v2-deep'}`}
          >
            {eyebrow}
          </span>
        </div>
      )}
      {children}
      </PlayerDrawerBody>
    </div>
  );
}
