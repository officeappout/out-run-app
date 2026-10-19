'use client';

/**
 * HybridRunLegV2 — the bottom of the v2 hybrid player on a run leg (U-D1,
 * F-3b) or the cool-down (U-D4): the continuous run card (the leg's numbers,
 * no live pace under 400 m, "הבא" = the station with a skip pill) and above
 * it the leg's action:
 *   • a station ahead → "הגעתי" (always offered; the one gradient CTA once
 *     the runner is in the approach window, a white pill before that);
 *   • no station ahead → "סיום" (the cool-down does NOT finish by itself).
 */

import React from 'react';
import { Button } from '@/components/ui/v2';
import ContinuousRunCardV2 from '../../players/running/components/Continuous/v2/ContinuousRunCardV2';
import { useFreeRunLive } from '../../players/running/components/FreeRun/v2/useFreeRunLive';
import { useZoneTracking } from '../../players/running/hooks/useZoneTracking';
import { fmtDistance } from '../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from './HybridPlayerV2Context';
import { legZone, nextBlockView } from './hybrid-v2-view';

export default function HybridRunLegV2({ api }: { api: HybridPlayerV2Api }) {
  const live = useFreeRunLive();
  const view = api.view;
  const seg = view?.segment ?? null;
  const zone = legZone(seg);
  const tracking = useZoneTracking(zone, view?.cursor ?? 0);
  if (!view) return null;

  const leg = view.leg;
  const next = nextBlockView(view, api.names);
  const hasStation = view.canArriveManually;
  const shortLeft = leg && !leg.showPace && leg.remainingM != null ? fmtDistance(leg.remainingM) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="pointer-events-auto flex w-full justify-center">
        {hasStation ? (
          view.approaching ? (
            <Button variant="cta" onClick={api.arriveNow} className="whitespace-nowrap">
              {next ? `הגעתי · ${next.label}` : 'הגעתי לתחנה'}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={api.arriveNow} className="whitespace-nowrap">
              הגעתי
            </Button>
          )
        ) : (
          <Button variant="cta" onClick={api.finish} className="min-w-[160px] whitespace-nowrap">
            סיום
          </Button>
        )}
      </div>
      <div className="w-full">
        <ContinuousRunCardV2
          data={{
            heroKind: leg?.targetM ? 'distance' : 'time',
            heroSeconds: leg?.elapsedSec ?? 0,
            heroKm: (leg?.coveredM ?? 0) / 1000,
            zone,
            tracking,
            currentPaceSec: live.currentPaceSec,
            showLivePace: leg?.showPace ?? true,
            totals: live.totals,
            plannedKm: leg?.targetM ? leg.targetM / 1000 : null,
            shortLegRemaining: shortLeft,
          }}
          next={next}
          canSkip={hasStation}
          onSkip={api.skipUpcoming}
          isPaused={live.isPaused}
          onPause={live.pause}
          onResume={live.resume}
          onLap={live.lap}
          onStop={api.finish}
        />
      </div>
    </div>
  );
}
