/**
 * superset.method — ProtocolMethod retrofit for the existing superset protocol (§11.2).
 * Pure delegation: zero new logic, zero touched existing files, zero live call sites.
 *
 * CORRECTION (was deferred earlier this session as "blocked — no standalone preview
 * component exists"): that was wrong. Superset's preview IS rendered by a discrete,
 * addressable component — `ExerciseCard` with `isSuperset=true` — same shape as any other
 * exercise card, styled by the SECTION-level cyan border wrapper
 * (`GeneratedWorkoutExerciseList.tsx`), not a per-pair component the way pyramid's
 * `PyramidStepCard` is. No live-file extraction needed; this wrapper delegates to the real
 * existing component exactly like pyramid.method.ts does.
 */

import type { ComponentProps } from 'react';
import type { ProtocolMethod } from '../types/method.types';
import type {
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { AntagonistPairProcessor } from '../../logic/protocols/antagonist-pair.processor';
import SupersetBlockGroup, {
  type SupersetBlockGroupProps,
} from '../../players/strength/playlist/blocks/SupersetBlockGroup';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';

export const supersetMethod: ProtocolMethod<
  WorkoutGenerationContext,
  WorkoutExercise[],
  SupersetBlockGroupProps,
  ComponentProps<typeof ExerciseCard>
> = {
  id: 'superset',
  name: 'סופר-סט',
  appliesTo: ['*'],

  /** No dedicated superset config exists — pairing is derived from
   *  `AntagonistPairProcessor.process` reading the exercise pool + context directly. */
  params: {} as WorkoutGenerationContext,

  buildSets: (exercises, context) =>
    AntagonistPairProcessor.process(exercises as WorkoutExercise[], context),

  renderActive: SupersetBlockGroup,
  renderPreview: ExerciseCard,
};
