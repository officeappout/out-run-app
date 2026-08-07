/**
 * pyramid.method — ProtocolMethod retrofit for the existing pyramid protocol (§11.2).
 * Pure delegation: zero new logic, zero touched existing files, zero live call sites.
 *
 * The easiest retrofit in the build plan: pyramid already shares one source-of-truth label
 * function (`pyramidLabel`) between its preview section header (`section-grouping.utils.ts`)
 * and its active queue card (`StrengthExerciseCard.tsx`) — the positive precedent §6.2's
 * dual-display contract formalizes. This wrapper just points at the real components; it does
 * not reimplement anything.
 *
 * "Peak sets" (סטים שיא, listed as its own row in the doc's §6.3 inventory) is NOT a
 * separate method — it's `PYRAMID_SHAPES[3]`'s ascending shape inside pyramid.processor.ts,
 * surfaced via the same `pyramidLabel()` returning "סט שיא". Do not create a
 * peak-sets.method.ts; the doc's §6.3 table should be corrected to reflect this (tracked
 * separately, not a code change).
 *
 * Note: pyramid has a SECOND real active-rendering surface not wrapped here —
 * `ActiveExerciseView.tsx`'s fullscreen per-step indicator ("שלב N מתוך M", driven by
 * `usePyramidManager.ts`). `StrengthExerciseCard` (the playlist/queue card) was chosen as
 * THE active delegate because it's the one that already imports `pyramidLabel` — the
 * `ActiveExerciseView` surface is a separate, later retrofit, not silently folded in here.
 */

import type { ComponentProps } from 'react';
import type { ProtocolMethod } from '../types/method.types';
import type {
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { PyramidProcessor } from '../../logic/protocols/pyramid.processor';
import StrengthExerciseCard, {
  type StrengthExerciseCardProps,
} from '../../players/strength/playlist/blocks/StrengthExerciseCard';
import PyramidStepCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/PyramidStepCard';

export const pyramidMethod: ProtocolMethod<
  WorkoutGenerationContext,
  WorkoutExercise[],
  StrengthExerciseCardProps,
  ComponentProps<typeof PyramidStepCard>
> = {
  id: 'pyramid',
  name: 'פירמידה',
  appliesTo: ['*'],

  /** No dedicated pyramid config exists — shape is derived from `difficulty` +
   *  `globalExercisePool`, both already on `WorkoutGenerationContext`. Empty object is a
   *  legitimate default (`PyramidProcessor.process` treats missing difficulty/pool as
   *  `?? 2` / `?? []`); a real generation call passes the actual context instead. */
  params: {} as WorkoutGenerationContext,

  buildSets: (exercises, context) =>
    PyramidProcessor.process(exercises as WorkoutExercise[], context),

  renderActive: StrengthExerciseCard,
  renderPreview: PyramidStepCard,
};
