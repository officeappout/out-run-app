/**
 * grouping.utils.ts — Workout plan flattening + sub-group clustering.
 *
 * Extracted from WorkoutPlaylist.tsx as part of the Blended Lego Block
 * Architecture refactor.  These helpers are pure (no React, no hooks),
 * so they can be re-used by the preview drawer, the running track, and
 * any future block-type dispatch without dragging UI dependencies.
 */

import type {
  WorkoutPlan,
  WorkoutSegment,
  Exercise as WorkoutExercise,
} from '@/features/parks';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import type { FlatExercise, SubGroup } from '../types';

/**
 * Returns the segment's exercise array under whichever field name the
 * plan happens to use (different generators emit different keys).
 */
export function getExercises(
  segment: WorkoutSegment | undefined,
): WorkoutExercise[] | null {
  if (!segment) return null;
  const seg = segment as any;
  if (Array.isArray(seg.exercises)) return seg.exercises;
  if (Array.isArray(seg.items)) return seg.items;
  if (Array.isArray(seg.list)) return seg.list;
  if (Array.isArray(seg.workout_exercises)) return seg.workout_exercises;
  if (Array.isArray(seg.workoutExercises)) return seg.workoutExercises;
  return null;
}

/**
 * Resolves a thumbnail URL for an exercise, falling through:
 *   1. pre-resolved `imageUrl` / `videoUrl` from the page flatten step
 *   2. shared 5-level deep media search (`resolveExerciseMedia`)
 *   3. logs a clear error and returns undefined when nothing exists
 */
export function resolveExImage(ex: WorkoutExercise): string | undefined {
  if (ex.imageUrl) return ex.imageUrl;
  if (ex.videoUrl) return ex.videoUrl;

  const raw = ex as any;
  const { imageUrl } = resolveExerciseMedia(raw, raw.method ?? null);
  if (imageUrl) return imageUrl;

  const name = typeof ex.name === 'string' ? ex.name : (raw.name?.he || ex.id);
  console.error(`[Media FAIL] No media found for playlist exercise: ${name}`);
  return undefined;
}

/**
 * Set-count resolver — checks the typed `sets` field first, then falls
 * back to parsing a "3x8" pattern out of the reps string.
 */
export function getSetsForExercise(
  ex: WorkoutExercise | null | undefined,
): number {
  if (!ex) return 1;
  if (typeof ex.sets === 'number' && ex.sets > 1) return ex.sets;
  const repsStr = ex.reps;
  if (repsStr) {
    const m = repsStr.match(/^(\d+)\s*[xX×]/);
    if (m) return parseInt(m[1], 10);
  }
  return 1;
}

/**
 * Numeric target-reps resolver — prefers `repsRange.min`, then strips a
 * leading set-prefix ("3x") from the reps string and reads the next int.
 */
export function parseTargetReps(ex: WorkoutExercise): number {
  if (ex.repsRange?.min) return ex.repsRange.min;
  const repsStr = ex.reps ?? '';
  const stripped = repsStr.replace(/^\d+\s*[xX×]\s*/, '');
  const match = stripped.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 10;
}

/**
 * Flattens a `WorkoutPlan` to a single array of `FlatExercise` entries.
 *
 * Handles pyramid rep-text construction ("12 → 10 → 8") and per-set
 * count overrides when a `pyramidSequence` / `repsSequence` is present.
 */
export function flattenWorkoutToExercises(workout: WorkoutPlan): FlatExercise[] {
  const result: FlatExercise[] = [];
  workout.segments.forEach((seg, si) => {
    const exercises = getExercises(seg);
    if (!exercises) return;
    exercises.forEach((ex, ei) => {
      const isTime = ex.exerciseType === 'time' || ex.isTimeBased === true;
      const rest = (ex as any).restSeconds ?? seg.restBetweenExercises ?? 30;
      const pyramidSequence = (ex as any).pyramidSequence as PyramidStep[] | undefined;
      const repsSequence = (ex as any).repsSequence as number[] | undefined;

      const baseSets = getSetsForExercise(ex);
      const sets = pyramidSequence?.length ?? repsSequence?.length ?? baseSets;

      let repsText = ex.reps || ex.duration || '';
      if (pyramidSequence && pyramidSequence.length > 0) {
        const targets = pyramidSequence.map(
          (s) => s.targetReps ?? s.targetHold ?? '?',
        );
        const unit = isTime ? ' שניות' : ' חזרות';
        repsText = `${targets.join(' → ')}${unit}`;
      } else if (repsSequence && repsSequence.length > 0) {
        const unit = isTime ? ' שניות' : ' חזרות';
        repsText = `${repsSequence.join(' → ')}${unit}`;
      }

      result.push({
        key: `${si}-${ei}`,
        segmentIndex: si,
        exerciseIndex: ei,
        exercise: ex,
        sets,
        targetReps: parseTargetReps(ex),
        repsText,
        exerciseType: isTime ? 'time' : 'reps',
        restDuration: typeof rest === 'number' ? rest : 30,
        segmentTitle: seg.title || '',
        repsSequence,
        pyramidSequence,
      });
    });
  });
  return result;
}

/**
 * Splits a segment's flat exercise list into ordered sub-groups.
 *
 * Superset pairs (mutual `pairedWith` links) → one grouped card.
 *   Set counts are equalized with Math.max so the state machine never
 *   encounters an undefined index desync between the two partners.
 * Everything else → individual straight-set cards (size 1).
 *
 * Pyramid exercises stay solo — different pyramid IDs represent
 * distinct movement progressions and must NOT be merged.
 */
export function buildMainSubGroups(exercises: FlatExercise[]): SubGroup[] {
  const byId = new Map<string, FlatExercise>();
  for (const fe of exercises) {
    byId.set(fe.exercise.id, fe);
  }
  const consumed = new Set<string>();
  const groups: SubGroup[] = [];

  for (const fe of exercises) {
    if (consumed.has(fe.exercise.id)) continue;

    const pairedId = (fe.exercise as any).pairedWith as string | null | undefined;

    if (pairedId) {
      const partner = byId.get(pairedId);
      const partnerPairedId = partner
        ? (partner.exercise as any).pairedWith as string | null | undefined
        : null;
      if (partner && partnerPairedId === fe.exercise.id) {
        consumed.add(partner.exercise.id);
        // Equalize partner set counts so cursor advancement is symmetric.
        const equalizedSets = Math.max(fe.sets, partner.sets);
        const feNorm = equalizedSets !== fe.sets ? { ...fe, sets: equalizedSets } : fe;
        const partNorm = equalizedSets !== partner.sets ? { ...partner, sets: equalizedSets } : partner;
        groups.push({ key: `ss-${fe.key}`, exercises: [feNorm, partNorm], isSuperSet: true });
        continue;
      }
      // Broken pairedWith link → fall through to straight-set below
    }

    groups.push({ key: `ind-${fe.key}`, exercises: [fe], isSuperSet: false });
  }

  return groups;
}
