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
 * The generated workout also gives its card home's hero media (the main
 * exercise's still / video loop, workout-card-media); the park's photo only
 * when the workout has no exercise media at all.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useLocationGateV1 } from '@/hooks/useLocationGateV1';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import {
  nearestRouteKmFromPark, pickPlaceBanner, suggestWorkoutsForPlace, type ParkPlace, type PlaceWorkoutSuggestion,
} from '@/features/workout-engine/place-fit';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import PlaceWorkoutRail from './PlaceWorkoutRail';
import { placeWorkoutCopy, type GeneratedLead } from './place-workout-copy';
import { usePlaceUserContext } from './hooks/usePlaceUserContext';
import { usePlaceWorkoutStart } from './hooks/usePlaceWorkoutStart';
import { placePhotoOf } from './place-card-media';
import { pickWorkoutCardMedia } from './workout-card-media';
import { isEmptyGeneratedWorkout, withoutHiddenCard } from './place-workout-empty';

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

type GeneratedState = Omit<GeneratedLead, 'media'> & { exercises: WorkoutExercise[] };

/**
 * Generates the park workout card's workout once per (park, difficulty, minutes): its meta line and hero media.
 * 'empty' = the generator built nothing (pilot AG8): the card is hidden rather than offering 0 min / 0 exercises.
 */
function useLeadWorkout(park: Park, equipment: readonly GymEquipment[], lead: PlaceWorkoutSuggestion | undefined): GeneratedLead | 'loading' | 'empty' | null {
  const profile = useUserStore((s) => s.profile);
  const posterFromVideo = useLocationGateV1(); // enable_location_gate_v1, as home's card
  const [state, setState] = useState<{ key: string; value: GeneratedState | null } | null>(null);
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
        if (!alive) return;
        setState({ key, value: {
          durationMin: Math.round(workout.estimatedDuration),
          exerciseCount: workout.exercises.length,
          exercises: workout.exercises,
        } });
      })
      .catch(() => { if (alive) setState({ key, value: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, profile?.id]);
  const ready = state?.key === key ? state.value : undefined;
  // Media resolves outside the effect so the location-gate flag can land after generation.
  return useMemo(() => {
    if (!start) return null;
    if (!key || ready === undefined) return 'loading';
    if (!ready) return null;
    if (isEmptyGeneratedWorkout(ready)) return 'empty';
    const media = pickWorkoutCardMedia(ready.exercises, 'park', posterFromVideo ? { posterFromVideo } : undefined);
    return { durationMin: ready.durationMin, exerciseCount: ready.exerciseCount, media };
  }, [start, key, ready, posterFromVideo]);
}

export default function ParkPlaceWorkouts({ park, equipment, userLocation, onClose, onLeadChange }: ParkPlaceWorkoutsProps) {
  const t = useT(map);
  const nearestRouteKm = useNearestRouteKm(park.location);
  const { ctx, todayRun, paceCtx } = usePlaceUserContext(true, userLocation);
  const basePace = useUserStore((s) => s.profile?.running?.paceProfile?.basePace ?? null);

  const place = useMemo<ParkPlace | null>(() => (nearestRouteKm === undefined ? null : {
    kind: 'park',
    parkId: park.id,
    equipment: equipment.map((e) => ({ id: e.id, name: e.name, iconKey: e.iconKey ?? null, movementPattern: e.movementPattern ?? null })),
    nearestRouteKm,
  }), [park.id, equipment, nearestRouteKm]);

  const ranked = useMemo(() => (place && ctx ? suggestWorkoutsForPlace(place, ctx) : []), [place, ctx]);
  // The park workout card (the plan's or the alternative): the one generated on open.
  const strengthCard = ranked.find((s) => s.start.kind === 'park_strength');
  const generated = useLeadWorkout(park, equipment, strengthCard);
  // An empty generated workout hides its card (AG8); the other cards stay.
  const emptyCard = generated === 'empty' ? strengthCard : null;
  const suggestions = useMemo(() => withoutHiddenCard(ranked, emptyCard), [ranked, emptyCard]);
  const lead = generated === 'empty' ? null : generated;
  const banner = useMemo(() => (place && ctx ? pickPlaceBanner(place, ctx, suggestions) : null), [place, ctx, suggestions]);
  const placePhoto = useMemo(() => placePhotoOf(park), [park]);
  const start = usePlaceWorkoutStart({ park, todayRun, basePaceSecPerKm: basePace, onClose });

  const first = suggestions[0];
  const leadCopy = first ? placeWorkoutCopy(first, t, first === strengthCard ? lead : null) : null;
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
      leadId={emptyCard ? null : strengthCard?.id ?? null}
      placePhoto={placePhoto}
      planRunBlocks={todayRun?.workout.blocks ?? null}
      paceCtx={paceCtx}
      onStart={(s) => start(s.start)}
    />
  );
}
