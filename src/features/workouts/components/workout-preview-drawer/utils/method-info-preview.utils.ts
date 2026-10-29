/**
 * The preview list's side of the method "i" sheet (enable_method_info_sheet_v1):
 * one ExerciseSection → the MethodInfoModel its header explains. PURE — the
 * list hands in how it resolves names and (cached) images, so the sheet shows
 * exactly the cards the list shows.
 */

import {
  buildMethodInfo,
  type MethodInfoModel,
  type MethodSource,
} from '@/features/workout-engine/core/methods/method-info/method-info.model';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { ExerciseSection } from '../types';

export interface SectionMethodOpts {
  /** The block's tabata clock (the strength tabata block or the timed tabata spec). */
  tabata?: { workSec: number; restSec: number; rounds: number };
  nameOf: (ex: EngineWorkoutExercise) => string;
  imageOf: (ex: EngineWorkoutExercise) => string;
}

/** Warmup / cooldown / timed AMRAP-EMOM sections explain no method → null. */
export function sectionMethodInfo(section: ExerciseSection, opts: SectionMethodOpts): MethodInfoModel | null {
  const kind = section.id.startsWith('superset')
    ? 'superset'
    : section.id.startsWith('pyramid')
      ? 'pyramid'
      : section.id.startsWith('regular')
        ? 'straight'
        : (section.id === 'tabata' || section.id === 'timed-main') && opts.tabata
          ? 'tabata'
          : null;
  if (!kind) return null;
  const sources: MethodSource[] = section.exercises.map((ex, i) => ({
    key: `${ex.exercise.id}-${i}`,
    name: opts.nameOf(ex),
    imageUrl: opts.imageOf(ex),
    sets: ex.sets,
    restSec: ex.restSeconds,
    exercise: ex,
    isUnilateral: ex.exercise.symmetry === 'unilateral',
    pyramidSequence: ex.pyramidSequence,
  }));
  return buildMethodInfo({ kind, label: section.title, sources, tabata: opts.tabata });
}
