'use client';

/**
 * HybridOverlayV2 — the home-v2 hybrid player over the live map (inside
 * FreeRunLayer's TOP layer; TwoLayerShell owns the drag, the session list
 * is the layer behind). Boards U-D1..U-D4, F-2b..F-2d, F-3b/F-3c.
 *
 *   top    — header card: cart icon (opens the list, ring = legs + sets),
 *            "ריצה + כוח", the leg / station line, the session clock, and
 *            story bars from the same strip as the ring.
 *   bottom — run / cool-down: HybridRunLegV2; transition: the countdown
 *            card; station: nothing (StrengthRunner owns the screen).
 */

import React from 'react';
import type { useDragControls } from 'framer-motion';
import { CartProgressIcon, StoryBars } from '@/components/ui/v2';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import { PlayerHeaderCard, usePublishedHeaderHeight } from '../../players/shared/v2';
import { useRunningPlayer } from '../../players/running/store/useRunningPlayer';
import { useSessionStore } from '../../core/store/useSessionStore';
import { fmtClock } from '../../players/running/lib/planned-rep-results';
import { toCartItems, toStorySegments } from '../../engines/strip-item';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';
import { headerView } from './hybrid-v2-view';
import HybridRunLegV2 from './HybridRunLegV2';
import HybridTransitionCardV2 from './HybridTransitionCardV2';

interface Props {
  dragControls: ReturnType<typeof useDragControls>;
  /** Reveal the session list behind (TwoLayerShell). */
  onMinimize: () => void;
}

export default function HybridOverlayV2({ dragControls, onMinimize }: Props) {
  const api = useHybridPlayerV2();
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const gpsAccuracy = useRunningPlayer((s) => s.gpsAccuracy);
  const header = usePublishedHeaderHeight();
  if (!api?.enabled || !api.view || !api.strip) return null;

  const view = api.view;
  const h = headerView(view, api.plan, api.names, api.label);
  const cart = toCartItems(api.strip);

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div ref={header.ref} className="px-3 pt-2">
          <PlayerHeaderCard
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              dragControls.start(e);
            }}
            leading={
              <CartProgressIcon items={cart} onClick={onMinimize} size={48} ariaLabel={`מהלך האימון · ${api.strip.doneCount} הושלמו`} />
            }
            eyebrow={h.eyebrow}
            eyebrowColor={h.color}
            title={h.title}
            trailing={
              <span dir="ltr" className="shrink-0 whitespace-nowrap text-[15px] font-black tabular-nums text-v2-ink">
                {fmtClock(Number.isFinite(totalDuration) ? totalDuration : 0)}
              </span>
            }
            strip={<StoryBars segments={toStorySegments(api.strip)} currentIndex={api.strip.currentIndex} progress={api.strip.progress} />}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute left-4 z-10" style={{ top: `calc(env(safe-area-inset-top, 0px) + ${header.height + 16}px)` }}>
        <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
      </div>

      <div className="absolute inset-x-3 z-10" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }} dir="rtl">
        {view.phase === 'transition' ? (
          <HybridTransitionCardV2 api={api} />
        ) : view.phase === 'run' || view.phase === 'cooldown' || view.phase === 'idle' ? (
          <HybridRunLegV2 api={api} />
        ) : null}
      </div>
    </>
  );
}
