'use client';

/**
 * RunHeaderStrip — the run / walk players' header attached to the top edge
 * (enable_run_player_drawer_v1; owner 21.10): full-bleed white fade, safe-area
 * aware, story bars first, then the row (cart icon · eyebrow + main line ·
 * trailing). Same look as the strength RunnerHeader and the planned-interval
 * header — replaces the floating PlayerHeaderCard. Doubles as the drag handle.
 *
 * Refs: `outerRef` gets the whole strip (safe area included — the camera
 * chrome, headerIncludesSafeTop), `innerRef` the part under the safe area
 * (what useMapStore.storyBarHeight means for the turn card / recenter pill).
 */

import React from 'react';

export interface RunHeaderStripProps {
  outerRef?: React.Ref<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
  /** Story bars / single progress bar — sits right under the status bar. */
  strip?: React.ReactNode;
  leading?: React.ReactNode;
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  trailing?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export const RUN_HEADER_FADE =
  'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 40%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0.4) 82%, rgba(255,255,255,0) 100%)';

export default function RunHeaderStrip({
  outerRef,
  innerRef,
  strip,
  leading,
  eyebrow,
  eyebrowColor = '#0284c7',
  title,
  trailing,
  onPointerDown,
}: RunHeaderStripProps) {
  return (
    <div
      ref={outerRef}
      dir="rtl"
      className="pointer-events-auto absolute inset-x-0 top-0 z-10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', background: RUN_HEADER_FADE, touchAction: 'none', fontFamily: 'var(--font-simpler)' }}
      onPointerDown={onPointerDown}
    >
      <div ref={innerRef} className="px-4 pb-5 pt-2.5">
        {strip && <div className="mb-2.5">{strip}</div>}
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
      </div>
    </div>
  );
}
