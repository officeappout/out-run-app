'use client';

/**
 * useRouteDirectionAdapt — G3.2 (Sderot pilot), behind `enable_route_direction_adapt` (fail-closed).
 *
 * On the FIRST leg of a hybrid session, watch the first ~60–150 m: if the user is clearly walking
 * a LOOP route the other way round, flip the live plan (useHybridRun.reverseRoute — list reversal
 * of the already-composed segments, never a re-compose), the map line, the deviation path and the
 * turn list, and say so in a short toast. A one_way route or an out-and-back palindrome is never
 * flipped (see route-direction.ts). Until the direction is settled, `startArrow` gives the map a
 * "which way to set off" arrow — on every route shape, pointing toward the first stop.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { computeRouteTurns } from '@/features/parks/core/services/geoUtils';
import {
  computeStartArrow, detectWalkDirection, isFlippableLoop, type LngLat,
} from '@/features/workout-engine/hybrid/route-direction';

export type StartArrow = { lat: number; lng: number; bearing: number };
import { useToast } from '@/components/ui/Toast';
import { g, type AppGender } from '@/lib/utils/gendered-text';
import type { Route } from '@/features/parks/core/types/route.types';

export function routeFlippedToast(gender: AppGender | null | undefined): string {
  return g(
    gender,
    'שמנו לב שאתה הולך בכיוון השני — הפכנו את סדר המסלול',
    'שמנו לב שאת הולכת בכיוון השני — הפכנו את סדר המסלול',
    'סדר המסלול עודכן לפי כיוון ההליכה',
  );
}

export function useRouteDirectionAdapt({
  enabled,
  focusedRoute,
  setFocusedRoute,
  gender,
}: {
  enabled: boolean;
  focusedRoute: Route | null | undefined;
  setFocusedRoute: (r: Route | null) => void;
  gender: AppGender | null | undefined;
}): { startArrow: StartArrow | null } {
  const hybridActive = useHybridRun((s) => s.active);
  const phase = useHybridRun((s) => s.phase);
  const nextStationNumber = useHybridRun((s) => s.nextStationNumber);
  const upcomingStation = useHybridRun((s) => s.upcomingStation);
  const lastPosition = useRunningPlayer((s) => s.lastPosition);
  const { showToast } = useToast();
  const [settled, setSettled] = useState(false);
  // Where the user joined the route (first fix of the session) — the start arrow's anchor.
  const [startPos, setStartPos] = useState<{ lat: number; lng: number } | null>(null);

  // A new session starts unsettled, with no start position yet.
  useEffect(() => { if (!hybridActive) { setSettled(false); setStartPos(null); } }, [hybridActive]);

  const onFirstLeg = enabled && hybridActive && phase === 'aerobic' && nextStationNumber === 1;

  useEffect(() => {
    if (onFirstLeg && !startPos && lastPosition) setStartPos({ lat: lastPosition.lat, lng: lastPosition.lng });
  }, [onFirstLeg, startPos, lastPosition?.lat, lastPosition?.lng]);

  useEffect(() => {
    if (!onFirstLeg || settled || !lastPosition) return;
    const path = focusedRoute?.path as LngLat[] | undefined;
    if (!focusedRoute || !path || path.length < 2) return;
    const verdict = detectWalkDirection(path, lastPosition);
    if (verdict === 'undecided') return;
    setSettled(true);
    if (verdict !== 'reverse' || !isFlippableLoop(path)) return;
    if (!useHybridRun.getState().reverseRoute()) return;
    const reversed = [...path].reverse() as LngLat[];
    const displayPath = (focusedRoute as any).displayPath as LngLat[] | undefined;
    setFocusedRoute({
      ...focusedRoute,
      path: reversed,
      ...(displayPath && displayPath.length > 1 ? { displayPath: [...displayPath].reverse() } : {}),
    } as Route);
    const rp = useRunningPlayer.getState();
    rp.setActiveRoutePath(reversed);
    rp.setGuidedRouteTurns(reversed.length >= 3 ? computeRouteTurns(reversed) : null);
    showToast('success', routeFlippedToast(gender));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFirstLeg, settled, lastPosition?.lat, lastPosition?.lng]);

  // The "which way to set off" arrow, every route shape (a one_way is never flipped, but still
  // gets the arrow): at the user's start on the line, pointing toward the first stop.
  const showArrow = onFirstLeg && !settled;
  const path = focusedRoute?.path as LngLat[] | undefined;
  const firstStopLat = upcomingStation?.lat;
  const firstStopLng = upcomingStation?.lng;
  const startArrow = useMemo(
    () => (showArrow && path
      ? computeStartArrow(path, startPos, firstStopLat != null && firstStopLng != null ? { lat: firstStopLat, lng: firstStopLng } : null)
      : null),
    [showArrow, path, startPos, firstStopLat, firstStopLng],
  );

  return { startArrow };
}
