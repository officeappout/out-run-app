'use client';

/**
 * useWhereToTrain — the drawer-side state of "איפה מתאמנים?" (enable_where_to_train_v1): the
 * workout's gear, the ranked nearby parks, the picked park (default = best match), the open sheet,
 * and the prefill both the carousel's sheet and the footer's share toggle use.
 */

import { useCallback, useMemo, useState } from 'react';
import { collectEquipment } from '../workout-preview-drawer/utils/equipment-collection.utils';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { TrainingHerePlace } from '@/features/parks/client/components/training-here/training-here.logic';
import { useWhereToTrainParks, type WhereToTrainPark } from './useWhereToTrainParks';

export function toTrainingHerePlace(p: WhereToTrainPark): TrainingHerePlace {
  return { kind: 'park', id: p.id, name: p.name, lat: p.lat, lng: p.lng, distanceM: p.distanceM };
}

export function useWhereToTrain(enabled: boolean, exercises: readonly EngineWorkoutExercise[] | undefined) {
  const gear = useMemo(() => collectEquipment((exercises ?? []) as EngineWorkoutExercise[]), [exercises]);
  const gearIds = useMemo(() => gear.map((g) => g.id), [gear]);
  const homeGearLabels = useMemo(() => gear.map((g) => g.label), [gear]);
  const { parks, loading } = useWhereToTrainParks(enabled, gearIds);

  const [pickedId, setPickedId] = useState<string | null>(null);
  // The last opened place stays set after closing so the sheet can animate out.
  const [sheetPlace, setSheetPlace] = useState<TrainingHerePlace | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const places = useMemo(() => parks.map(toTrainingHerePlace), [parks]);
  const selectedParkId = pickedId && parks.some((p) => p.id === pickedId) ? pickedId : parks[0]?.id ?? null;
  const selectedPlace = places.find((p) => p.id === selectedParkId) ?? null;

  const openPark = useCallback((p: WhereToTrainPark) => {
    setPickedId(p.id);
    setSheetPlace(toTrainingHerePlace(p));
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const pickOnly = useCallback((place: TrainingHerePlace) => setPickedId(place.id), []);

  return {
    parks, loading, homeGearLabels, places, selectedParkId, selectedPlace,
    /** The card the user explicitly tapped (null until then; selectedParkId falls back to the best match). */
    pickedParkId: pickedId && parks.some((p) => p.id === pickedId) ? pickedId : null,
    sheetPlace, sheetOpen, openPark, closeSheet, pickOnly,
  };
}
