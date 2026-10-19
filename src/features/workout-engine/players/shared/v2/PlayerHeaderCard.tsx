'use client';

/**
 * PlayerHeaderCard — the floating white card at the top of a v2 live player
 * (board R2-prop-easy's goal card, U-B1's live header): a leading slot (the
 * cart icon), a coloured eyebrow ("ריצה קלה · יעד 35 דק׳"), the main line
 * ("נותרו 14:34 דק׳"), a trailing value (58% / the clock) and a progress
 * strip (StoryBars or a single bar). Doubles as the drag handle.
 */

import React from 'react';

export interface PlayerHeaderCardProps {
  leading?: React.ReactNode;
  eyebrow: string;
  /** Eyebrow colour (the activity / zone colour). */
  eyebrowColor?: string;
  title: string;
  trailing?: React.ReactNode;
  /** Progress strip under the row. */
  strip?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export default function PlayerHeaderCard({ leading, eyebrow, eyebrowColor = '#0284c7', title, trailing, strip, onPointerDown }: PlayerHeaderCardProps) {
  return (
    <div
      dir="rtl"
      className="pointer-events-auto rounded-[22px] bg-white/95 px-3.5 py-3 shadow-v2-float"
      style={{ touchAction: 'none', fontFamily: 'var(--font-simpler)' }}
      onPointerDown={onPointerDown}
    >
      <div className="flex items-center gap-2.5">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="truncate whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: eyebrowColor }}>
            {eyebrow}
          </div>
          <div className="truncate whitespace-nowrap text-[16px] font-black text-v2-ink">{title}</div>
        </div>
        {trailing}
      </div>
      {strip && <div className="mt-2.5">{strip}</div>}
    </div>
  );
}

/** A single rounded progress bar for the header strip (fills from the start edge, RTL). */
export function HeaderProgressBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-v2-hairline" aria-hidden>
      <div className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-500 ease-v2" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
