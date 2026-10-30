'use client';

/**
 * StructureInfoButton — the "i" next to the strength preview's title
 * (enable_feature_info_sheets_v1): how the workout is built, from its own sections.
 */

import React, { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';
import { useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import { useContentLanguage } from '@/features/content/shared/useContentLanguage';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { groupExercisesIntoSections } from '@/features/workouts/components/workout-preview-drawer/utils/section-grouping.utils';
import { resolveExerciseImage } from '@/features/workouts/components/workout-preview-drawer/utils/exercise-display.utils';
import { sectionMethodInfo } from '@/features/workouts/components/workout-preview-drawer/utils/method-info-preview.utils';
import { useMethodInfoSheetV1 } from '@/features/workout-engine/components/method-info/useMethodInfoSheetV1';
import InfoSheetButton from '../InfoSheetButton';
import { buildStructureInfo } from './structure-info.model';
import { structureCopy } from './structure-info.copy';
import StructureInfoDemo from './StructureInfoDemo';

export interface StructureInfoButtonProps {
  exercises: EngineWorkoutExercise[];
  /** The strength tabata block's clock, when the workout has one (its method "i"). */
  tabata?: { workSec: number; restSec: number; rounds: number };
  /** Same poster rule as the list (location gate on → video posters). */
  posterFromVideo?: boolean;
}

export default function StructureInfoButton({ exercises, tabata, posterFromVideo = false }: StructureInfoButtonProps) {
  const t = useT(library);
  const contentLang = useContentLanguage();
  const methodOn = useMethodInfoSheetV1();
  const sections = useMemo(() => groupExercisesIntoSections(exercises, undefined, t), [exercises, t]);
  const urls = useMemo(
    () => exercises.map((ex) => resolveExerciseImage(ex, posterFromVideo ? { posterFromVideo } : undefined)),
    [exercises, posterFromVideo],
  );
  const cached = useCachedMediaMap(urls);
  const model = useMemo(
    () => buildStructureInfo(sections.map((s) => ({ id: s.id, title: s.title, exerciseCount: s.exercises.length }))),
    [sections],
  );
  if (!model) return null;

  const byId = new Map(sections.map((s) => [s.id, s]));
  const imageOf = (ex: EngineWorkoutExercise) => {
    const url = resolveExerciseImage(ex, posterFromVideo ? { posterFromVideo } : undefined);
    return cached.get(url) || url;
  };
  const mainId = model.parts.find((p) => p.kind === 'main')?.sectionIds[0];
  const mainSection = mainId ? byId.get(mainId) : undefined;
  const mainMethod =
    methodOn && mainSection
      ? sectionMethodInfo(mainSection, {
          tabata: mainSection.id === 'tabata' ? tabata : undefined,
          nameOf: (ex) => (typeof ex.exercise.name === 'string' ? ex.exercise.name : getLocalizedText(ex.exercise.name, contentLang)),
          imageOf,
        })
      : null;
  const copy = structureCopy(model, t, { methodInfo: methodOn });

  return (
    <InfoSheetButton
      title={copy.title}
      openLabel={t('featureInfo.structure.open')}
      lead={copy.lead}
      demoLabel={t('featureInfo.fromToday')}
      demo={<StructureInfoDemo model={model} sections={byId} imageOf={imageOf} mainMethod={mainMethod} />}
      steps={copy.steps}
      chips={copy.chips}
      kellyContext={(q) => t('featureInfo.kellyContext', { topic: t('featureInfo.structure.topic'), q })}
    />
  );
}
