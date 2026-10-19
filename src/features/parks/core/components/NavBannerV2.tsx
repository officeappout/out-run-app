'use client';

/**
 * NavBannerV2 — home-v2 (enable_home_v2) Waze-style navigation banner.
 *
 * ONE glass card at the top of the live map that joins:
 *   • the next maneuver — icon tile, live distance to it, street / instruction
 *     (from TurnCarousel's existing turn data: computeRouteTurns / the
 *     session's guidedRouteTurns + lazily reverse-geocoded street names), and
 *   • route progress — % along the route + distance left (route-progress.ts's
 *     monotonic along-route projection, so the walk TO the route doesn't count).
 *
 * While the user is still walking to the route (no fix on the line yet and
 * > 40 m off it) the top row says so and shows the distance to the route
 * instead of the route's own next turn, which would be misleading there.
 *
 * Route run v2: the elevation-ahead strip sits under the progress bar when
 * the route has elevation samples (useRouteRunV2Store, published by
 * RouteRunLiveV2Controller).
 *
 * Rendered only by TurnCarousel's THIN state when v2 is on; the legacy THIN
 * card / FULL carousel / BUBBLE pill are untouched. Tap → FULL swipe carousel
 * (same as the legacy THIN card). Progress row only during an active/paused
 * session (TurnCarousel also mounts for pre-workout navigation).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Footprints, Minimize2 } from 'lucide-react';
import { crossTrackDistanceMeters } from '../services/geoUtils';
import { advanceRouteProgress, buildCumulativeMeters, type LngLat } from '../services/route-progress';
import { navBannerProgress, formatBannerDistance, isApproaching } from '../services/nav-banner';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { isFiniteLatLng } from '@/utils/geoValidation';
import { useRouteRunV2Store } from '@/features/workout-engine/players/running/store/useRouteRunV2Store';
import RouteElevationAhead from '@/features/workout-engine/players/running/components/RouteRun/v2/RouteElevationAhead';

const DEST_GREEN = '#16A34A';

export interface NavBannerV2Props {
  icon: React.ElementType;
  /** Small dim line (the maneuver) when the headline is a street name. */
  actionLine: string | null;
  /** Big line — street name, or the maneuver itself. */
  headline: string;
  /** Live metres to the next maneuver / finish. */
  distanceM: number | null;
  isDestination: boolean;
  /** < 50 m to the maneuver (TurnCarousel's proximity hysteresis). */
  imminent: boolean;
  routePath: [number, number][];
  currentLocation: { lat: number; lng: number };
  onExpand: () => void;
  onMinimize: () => void;
}

export default function NavBannerV2({
  icon: IconComp,
  actionLine,
  headline,
  distanceM,
  isDestination,
  imminent,
  routePath,
  currentLocation,
  onExpand,
  onMinimize,
}: NavBannerV2Props) {
  const status = useSessionStore((s) => s.status);
  const sessionActive = status === 'active' || status === 'paused';
  const guidedRouteName = useRunningPlayer((s) => s.guidedRouteName);
  // The session's own path (a loop is rotated to start at the user — see
  // useWorkoutSession._doStartActiveWorkout); falls back to the drawn route.
  const activeRoutePath = useRunningPlayer((s) => s.activeRoutePath);
  const progressPath = useMemo<LngLat[]>(
    () => (sessionActive && Array.isArray(activeRoutePath) && activeRoutePath.length >= 2
      ? (activeRoutePath as LngLat[])
      : routePath),
    [sessionActive, activeRoutePath, routePath],
  );
  const cum = useMemo(() => buildCumulativeMeters(progressPath), [progressPath]);

  // Monotonic along-route progress (metres). Reset when the path changes.
  const alongRef = useRef<number | null>(null);
  const pathRef = useRef(progressPath);
  if (pathRef.current !== progressPath) {
    pathRef.current = progressPath;
    alongRef.current = null;
  }
  const userValid = isFiniteLatLng(currentLocation);
  if (userValid && sessionActive) {
    alongRef.current = advanceRouteProgress(alongRef.current, currentLocation, progressPath, cum);
  }
  useEffect(() => {
    if (!sessionActive) alongRef.current = null;
  }, [sessionActive]);

  const totalM = cum[cum.length - 1] ?? 0;
  const progress = navBannerProgress(alongRef.current, totalM);
  const crossTrackM = userValid && !progress.joined
    ? crossTrackDistanceMeters(currentLocation, progressPath)
    : 0;
  const elevation = useRouteRunV2Store((s) => s.elevation);
  const approaching = sessionActive && isApproaching(progress.joined, crossTrackM);

  const TopIcon = approaching ? Footprints : IconComp;
  const topDistance = approaching ? crossTrackM : distanceM;
  const topHeadline = approaching ? 'הליכה אל המסלול' : headline;
  const topAction = approaching ? 'עד הנקודה הקרובה במסלול' : actionLine;
  const tileColor = !approaching && isDestination ? DEST_GREEN : '#0284c7';

  return (
    <div
      dir="rtl"
      className={`v2-glass-card relative overflow-hidden rounded-[22px] pointer-events-auto transition-shadow duration-200 ease-v2 ${
        imminent && !approaching ? 'ring-2 ring-v2-accent' : ''
      }`}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="הצג את כל הפניות"
        className="flex w-full items-center gap-3 pb-2.5 pl-12 pr-3 pt-3 text-right transition-transform duration-150 ease-v2 active:scale-[0.99]"
      >
        {/* dir="ltr": lucide arrows must never be mirrored by an RTL ancestor (see TurnCarousel). */}
        <div
          dir="ltr"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white"
          style={{ background: tileColor }}
        >
          <TopIcon size={26} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          {topDistance != null && Number.isFinite(topDistance) && (
            <p className="whitespace-nowrap text-[24px] font-black leading-none tabular-nums text-v2-ink !tracking-[-0.02em]">
              {formatBannerDistance(topDistance)}
            </p>
          )}
          <p className="mt-1 truncate text-[15px] font-extrabold leading-tight text-v2-ink">
            {topHeadline}
          </p>
          {topAction && (
            <p className="truncate text-[12px] font-bold leading-tight text-v2-muted">
              {topAction}
            </p>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={onMinimize}
        aria-label="מזעור ניווט"
        className="absolute left-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/80 ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Minimize2 size={14} className="text-v2-ink-2" />
      </button>

      {sessionActive && totalM > 0 && (
        <div className="border-t border-v2-hairline px-3.5 pb-3 pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[12px] font-extrabold text-v2-ink-2">
              {guidedRouteName || 'התקדמות במסלול'}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold tabular-nums text-v2-deep">
              {progress.joined
                ? `${progress.pct}% · נותרו ${formatBannerDistance(progress.remainingM)}`
                : `${formatBannerDistance(totalM)} במסלול`}
            </span>
          </div>
          <div
            className="relative h-1.5 overflow-hidden rounded-full bg-v2-hairline"
            role="progressbar"
            aria-label="התקדמות במסלול"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.pct}
          >
            <div
              className="absolute inset-y-0 right-0 rounded-full bg-v2-accent transition-[width] duration-500 ease-v2"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          {progress.joined && (
            <RouteElevationAhead
              samples={elevation}
              alongM={alongRef.current}
              totalM={totalM}
              className="mt-2.5"
            />
          )}
        </div>
      )}
    </div>
  );
}
