'use client';

/**
 * Park page "מתאים לך כאן" (enable_place_workouts_v1, board RP-13 phone 1).
 *
 * Cost: ranking is pure (place-fit). The hybrid rule reads the official
 * routes from the existing per-session cache (getCachedOfficialRoutes). Only
 * the FIRST card's park workout is generated, once, when the page opens —
 * from the equipment docs the sheet already loaded (no re-read) — to show its
 * real length and exercise count. The other cards are composed on tap by the
 * existing start paths. Reports the lead card to the sheet for its sticky CTA.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  nearestRouteKmFromPark, pickPlaceBanner, suggestWorkoutsForPlace, type ParkPlace, type PlaceWorkoutSuggestion,
} from '@/features/workout-engine/place-fit';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import PlaceWorkoutRail from './PlaceWorkoutRail';
import { placeWorkoutCopy, type GeneratedLead } from './place-workout-copy';
import { usePlaceUserContext } from './hooks/usePlaceUserContext';
import { usePlaceWorkoutStart } from './hooks/usePlaceWorkoutStart';

export interface PlaceLeadCta {
  label: string;
  start: () => void;
}

export interface ParkPlaceWorkoutsProps {
  park: Park;
  equipment: readonly GymEquipment[];
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  /** The first card, for the sheet's sticky CTA (null = keep the sheet's own CTA). */
  onLeadChange: (lead: PlaceLeadCta | null) => void;
}

/** One cached-routes read per session (the cache itself lives in inventory.service). */
function useNearestRouteKm(location: { lat: number; lng: number } | undefined): number | null | undefined {
  const [km, setKm] = useState<number | null | undefined>(undefined);
  const lat = location?.lat;
  const lng = location?.lng;
  useEffect(() => {
    if (lat == null || lng == null) { setKm(null); return; }
    let alive = true;
    import('@/features/parks/core/services/inventory.service')
      .then(({ getCachedOfficialRoutes }) => getCachedOfficialRoutes())
      .then((routes) => { if (alive) setKm(nearestRouteKmFromPark(routes, { lat, lng })); })
      .catch(() => { if (alive) setKm(null); });
    return () => { alive = false; };
  }, [lat, lng]);
  return km;
}

/** Generates the lead park workout once per (park, difficulty, minutes) for its meta line. */
function useLeadWorkout(park: Park, equipment: readonly GymEquipment[], lead: PlaceWorkoutSuggestion | undefined): GeneratedLead | 'loading' | null {
  const profile = useUserStore((s) => s.profile);
  const [state, setState] = useState<{ key: string; value: GeneratedLead | null } | null>(null);
  const start = lead?.start.kind === 'park_strength' ? lead.start : null;
  // Wait for the sheet's equipment docs (a park with tagged equipment and none loaded yet).
  const equipmentReady = !(park.gymEquipment?.length) || equipment.length > 0;
  const key = start && equipmentReady ? `${park.id}|${start.difficulty}|${start.minutes}|${equipment.length}` : null;
  useEffect(() => {
    if (!key || !start || !profile) return;
    if (state?.key === key) return;
    let alive = true;
    const ids = equipment.map((e) => e.id);
    const brands = Object.fromEntries((park.gymEquipment ?? []).filter((g) => g.brandName).map((g) => [g.equipmentId, g.brandName as string]));
    import('@/features/workout-engine/services/compose-park-strength-workout.service')
      .then(({ composeParkWorkoutFromMachines }) =>
        composeParkWorkoutFromMachines([...equipment], profile, { difficulty: start.difficulty, availableTime: start.minutes }, ids, brands))
      .then(({ workout }) => {
        if (alive) setState({ key, value: { durationMin: Math.round(workout.estimatedDuration), exerciseCount: workout.exercises.length } });
      })
      .catch(() => { if (alive) setState({ key, value: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, profile?.id]);
  if (!start) return null;
  if (!key) return 'loading';
  return state?.key === key ? state.value : 'loading';
}

export default function ParkPlaceWorkouts({ park, equipment, userLocation, onClose, onLeadChange }: ParkPlaceWorkoutsProps) {
  const t = useT(map);
  const nearestRouteKm = useNearestRouteKm(park.location);
  const { ctx, todayRun } = usePlaceUserContext(true, userLocation);
  const basePace = useUserStore((s) => s.profile?.running?.paceProfile?.basePace ?? null);

  const place = useMemo<ParkPlace | null>(() => (nearestRouteKm === undefined ? null : {
    kind: 'park',
    parkId: park.id,
    equipment: equipment.map((e) => ({ id: e.id, name: e.name, iconKey: e.iconKey ?? null, movementPattern: e.movementPattern ?? null })),
    nearestRouteKm,
  }), [park.id, equipment, nearestRouteKm]);

  const suggestions = useMemo(() => (place && ctx ? suggestWorkoutsForPlace(place, ctx) : []), [place, ctx]);
  const banner = useMemo(() => (place && ctx ? pickPlaceBanner(place, ctx, suggestions) : null), [place, ctx, suggestions]);
  const lead = useLeadWorkout(park, equipment, suggestions[0]);
  const start = usePlaceWorkoutStart({ park, todayRun, basePaceSecPerKm: basePace, onClose });

  const first = suggestions[0];
  const leadCopy = first ? placeWorkoutCopy(first, t, lead) : null;
  const leadLabel = leadCopy
    ? leadCopy.minutes != null
      ? t('placeWorkouts.cta.sticky', { title: leadCopy.shortTitle, min: String(leadCopy.minutes) })
      : leadCopy.shortTitle
    : null;
  useEffect(() => {
    onLeadChange(first && leadLabel ? { label: leadLabel, start: () => start(first.start) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, leadLabel, start]);
  useEffect(() => () => onLeadChange(null), [onLeadChange]);

  return (
    <PlaceWorkoutRail
      title={t('placeWorkouts.park.title')}
      subtitle={t('placeWorkouts.park.subtitle')}
      suggestions={suggestions}
      banner={banner}
      lead={lead}
      onStart={(s) => start(s.start)}
    />
  );
}
