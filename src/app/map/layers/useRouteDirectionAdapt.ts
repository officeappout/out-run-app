'use client';

/**
 * useRouteDirectionAdapt — G3.2 (Sderot pilot), behind `enable_route_direction_adapt` (fail-closed).
 *
 * On the FIRST leg of a hybrid session, watch the first ~60–150 m: if the user is clearly walking
 * a LOOP route the other way round, flip the live plan (useHybridRun.reverseRoute — list reversal
 * of the already-composed segments, never a re-compose), the map line, the deviation path and the
 * turn list, and say so in a short toast. A one_way route or an out-and-back palindrome is never
 * flipped (see route-direction.ts). Until the direction is settled, `showStartArrow` asks the map
 * to show the "which way to set off" arrow at the start.
 */
import { useEffect, useState } from 'react';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { computeRouteTurns } from '@/features/parks/core/services/geoUtils';
import {
  detectWalkDirection, isFlippableLoop, type LngLat,
} from '@/features/workout-engine/hybrid/route-direction';
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
}): { showStartArrow: boolean } {
  const hybridActive = useHybridRun((s) => s.active);
  const phase = useHybridRun((s) => s.phase);
  const nextStationNumber = useHybridRun((s) => s.nextStationNumber);
  const lastPosition = useRunningPlayer((s) => s.lastPosition);
  const { showToast } = useToast();
  const [settled, setSettled] = useState(false);

  // A new session starts unsettled.
  useEffect(() => { if (!hybridActive) setSettled(false); }, [hybridActive]);

  const onFirstLeg = enabled && hybridActive && phase === 'aerobic' && nextStationNumber === 1;

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

  return { showStartArrow: onFirstLeg && !settled };
}
