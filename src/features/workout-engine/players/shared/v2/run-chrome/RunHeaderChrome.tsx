'use client';

/**
 * RunHeaderChrome — the run header of the attached chrome (enable_run_player_drawer_v1,
 * boards H-1/H-7): full-bleed white fade, safe-area aware; the sliding layers
 * (blocks / together / race) and, attached underneath, the slim data strip.
 * Doubles as the shell's drag handle. Refs mirror RunHeaderStrip.
 */

import React from 'react';
import { RUN_HEADER_FADE } from '../RunHeaderStrip';
import RunDataStrip, { type RunDataStripItem } from './RunDataStrip';
import RunTopLayers, { type RunTopLayersProps } from './RunTopLayers';

export interface RunHeaderChromeProps extends RunTopLayersProps {
  outerRef?: React.Ref<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
  strip: RunDataStripItem[];
  /** e.g. the GPS indicator, tucked at the end of the layer row. */
  trailing?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export default function RunHeaderChrome({ outerRef, innerRef, strip, trailing, onPointerDown, layers, index, onIndexChange }: RunHeaderChromeProps) {
  return (
    <div
      ref={outerRef}
      className="pointer-events-auto absolute inset-x-0 top-0 z-10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', background: RUN_HEADER_FADE, touchAction: 'none', fontFamily: 'var(--font-simpler)' }}
      onPointerDown={onPointerDown}
    >
      <div ref={innerRef} className="pb-5 pt-2.5">
        <div className="relative">
          <RunTopLayers layers={layers} index={index} onIndexChange={onIndexChange} />
          {trailing && <div className="pointer-events-none absolute end-3 top-0">{trailing}</div>}
        </div>
        <RunDataStrip items={strip} />
      </div>
    </div>
  );
}
