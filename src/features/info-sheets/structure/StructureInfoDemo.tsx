'use client';

/**
 * StructureInfoDemo — the structure sheet's loop (board TutStructureCard): the workout's own
 * parts, each with the preview's real SectionHeader (warm-up with its "פעיל" pill, the main
 * block with its own method "i" when that flag is on) and its first cards (the real
 * ExerciseCard, swap button included), lit one after another. Visual only: the whole demo is
 * inert. Reduced motion: static, nothing lit.
 */

import React from 'react';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';
import SectionHeader from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/SectionHeader';
import type { ExerciseSection } from '@/features/workouts/components/workout-preview-drawer/types';
import type { MethodInfoModel } from '@/features/workout-engine/core/methods/method-info/method-info.model';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { useInfoLoop } from '../useInfoLoop';
import { inertRef } from '../inert-ref';
import type { StructureInfoModel, StructurePartKind } from './structure-info.model';

const PART_MS = 3000;
const RING: Record<StructurePartKind, string> = {
  warmup: 'shadow-[0_0_0_2px_#67e8f9]',
  main: 'shadow-[0_0_0_2px_#00baf7]',
  cooldown: 'shadow-[0_0_0_2px_#a5b4fc]',
};
/** Cards shown per part (the main block shows two, like the board). */
const CARDS: Record<StructurePartKind, number> = { warmup: 1, main: 2, cooldown: 1 };
const noop = () => {};

export interface StructureInfoDemoProps {
  model: StructureInfoModel;
  /** The preview's sections, by id. */
  sections: ReadonlyMap<string, ExerciseSection>;
  imageOf: (ex: EngineWorkoutExercise) => string;
  /** The main block's method model (enable_method_info_sheet_v1), for its own "i". */
  mainMethod: MethodInfoModel | null;
}

export default function StructureInfoDemo({ model, sections, imageOf, mainMethod }: StructureInfoDemoProps) {
  const { phase, reduced } = useInfoLoop(model.parts.map(() => PART_MS));
  return (
    <div aria-hidden className="pointer-events-none flex flex-col gap-2" ref={inertRef}>
      {model.parts.map((part, i) => {
        const section = sections.get(part.sectionIds[0]);
        if (!section) return null;
        const lit = !reduced && phase === i;
        return (
          <div
            key={part.kind}
            className={`flex flex-col gap-1.5 rounded-[16px] bg-white p-1.5 transition-shadow duration-300 ${lit ? RING[part.kind] : ''}`}
          >
            <SectionHeader
              section={section}
              isWarmup={part.kind === 'warmup'}
              isSuperset={section.id.startsWith('superset')}
              isPyramidSection={section.id.startsWith('pyramid')}
              isWarmupActive
              isWarmupExpanded
              hideExpandToggle
              onToggleWarmupExpanded={noop}
              onToggleWarmupActive={noop}
              methodInfo={part.kind === 'main' ? mainMethod : null}
            />
            {section.exercises.slice(0, CARDS[part.kind]).map((ex, j) => (
              <ExerciseCard key={`${ex.exercise.id}-${j}`} exercise={ex} cachedImageUrl={imageOf(ex)} isSuperset={false} framed onSwap={noop} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
