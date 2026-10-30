'use client';

/**
 * StopsInfoButton — the "i" next to the route + stops overview title
 * (enable_feature_info_sheets_v1). Renders nothing for a route without a usable strength
 * station (buildStopsInfo → null).
 */

import React, { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveExerciseImage } from '@/features/workouts/components/workout-preview-drawer/utils/exercise-display.utils';
import { journeyItemsFromLegs, type OverviewLeg } from '@/features/parks/core/components/overview/overview-legs';
import InfoSheetButton from '../InfoSheetButton';
import { buildStopsInfo } from './stops-info.model';
import StopsInfoDemo from './StopsInfoDemo';

export interface StopsInfoButtonProps {
  /** The overview's own legs (buildHybridLegs, same options as its strip). */
  legs: readonly OverviewLeg[];
  segments: readonly HybridPlannedSegment[];
  stationName: string;
}

export default function StopsInfoButton({ legs, segments, stationName }: StopsInfoButtonProps) {
  const t = useT(map);
  const model = useMemo(() => buildStopsInfo(legs, segments), [legs, segments]);
  const exercises = useMemo(
    () => ((model ? segments[model.stationRef]?.content?.exercises : undefined) ?? []) as EngineWorkoutExercise[],
    [model, segments],
  );
  const urls = useMemo(() => exercises.map((ex) => resolveExerciseImage(ex)), [exercises]);
  const cached = useCachedMediaMap(urls);
  const strip = useMemo(() => journeyItemsFromLegs(legs), [legs]);
  if (!model) return null;
  const imageOf = (ex: EngineWorkoutExercise) => {
    const url = resolveExerciseImage(ex);
    return cached.get(url) || url;
  };
  return (
    <InfoSheetButton
      title={t('featureInfo.stops.title')}
      openLabel={t('featureInfo.stops.open')}
      lead={t('featureInfo.stops.lead')}
      demoLabel={t('featureInfo.stops.fromRoute')}
      demo={(ctl) => (
        <StopsInfoDemo model={model} t={t} ctl={ctl} strip={strip} stationName={stationName} exercises={exercises} imageOf={imageOf} />
      )}
      steps={[t('featureInfo.stops.step1'), t('featureInfo.stops.step2'), t('featureInfo.stops.step3')]}
      chips={[t('featureInfo.stops.chip1'), t('featureInfo.stops.chip2')]}
      kellyContext={(q) => t('featureInfo.stops.kellyContext', { topic: t('featureInfo.stops.topic'), q })}
    />
  );
}
