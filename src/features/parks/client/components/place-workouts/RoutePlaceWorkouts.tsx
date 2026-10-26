'use client';

/**
 * Route page "אימונים על המסלול הזה" (enable_place_workouts_v1, board RP-13
 * phone 2). Pure ranking on the route the sheet already holds — route-fit's
 * scorer per candidate, no generator, no extra reads beyond today's plan.
 */

import { useMemo } from 'react';
import type { Route } from '@/features/parks/core/types/route.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  parkNearRoute, pickPlaceBanner, suggestWorkoutsForPlace, type RoutePlace,
} from '@/features/workout-engine/place-fit';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import PlaceWorkoutRail from './PlaceWorkoutRail';
import { usePlaceUserContext } from './hooks/usePlaceUserContext';
import { usePlaceWorkoutStart } from './hooks/usePlaceWorkoutStart';
import { placePhotoOf } from './place-card-media';

export interface RoutePlaceWorkoutsProps {
  route: Route;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

export default function RoutePlaceWorkouts({ route, userLocation, onClose }: RoutePlaceWorkoutsProps) {
  const t = useT(map);
  const { ctx, todayRun, paceCtx } = usePlaceUserContext(true, userLocation);
  const basePace = useUserStore((s) => s.profile?.running?.paceProfile?.basePace ?? null);
  const place = useMemo<RoutePlace>(() => ({ kind: 'route', route, parkNearRoute: parkNearRoute(route) }), [route]);
  const suggestions = useMemo(() => (ctx ? suggestWorkoutsForPlace(place, ctx) : []), [place, ctx]);
  const banner = useMemo(() => (ctx ? pickPlaceBanner(place, ctx, suggestions) : null), [place, ctx, suggestions]);
  const start = usePlaceWorkoutStart({ route, todayRun, basePaceSecPerKm: basePace, onClose });

  return (
    <PlaceWorkoutRail
      title={t('placeWorkouts.route.title')}
      subtitle={t('placeWorkouts.route.subtitle')}
      suggestions={suggestions}
      banner={banner}
      placePhoto={placePhotoOf(route)}
      planRunBlocks={todayRun?.workout.blocks ?? null}
      paceCtx={paceCtx}
      onStart={(s) => start(s.start)}
    />
  );
}
