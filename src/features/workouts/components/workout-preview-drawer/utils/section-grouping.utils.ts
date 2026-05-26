/**
 * Section grouping utilities for WorkoutPreviewDrawer.
 *
 * Partitions an engine-generated workout's exercises into ordered visual
 * sections (warmup, superset pairs, pyramids, straight sets, cooldown).
 * Pure functions only — no React, no side-effects beyond opt-in dev logging.
 */
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { pyramidLabel } from '@/features/workout-engine/logic/protocols/pyramid.processor';
import type { ExerciseSection } from '../types';

/** Verbose per-exercise tracing is opt-in to avoid console-storming production. */
const VERBOSE_GROUP_LOG = process.env.NODE_ENV !== 'production';

/** Resolve a display name from an EngineWorkoutExercise for logging */
export function exDisplayName(ex: EngineWorkoutExercise): string {
  const n = ex.exercise.name;
  return typeof n === 'string' ? n : (n as any)?.he ?? (n as any)?.en ?? ex.exercise.id;
}

/**
 * Groups exercises into ordered visual sections that perfectly mirror the
 * engine's execution sequence.
 *
 * Rules:
 *  • An exercise enters a **Superset section** ONLY when it has a non-empty
 *    `pairedWith` that points to an exercise which ALSO points back (mutual
 *    link).  Both exercises share ONE section and the partner is consumed so
 *    it is not re-emitted.
 *  • An exercise with `pairedWith` that has no mutual link is demoted to a
 *    standalone regular section with a console warning.
 *  • Exercises without `pairedWith` are always standalone regular sections.
 *  • Warmup / cooldown exercises are collected into single prefix/suffix
 *    sections to keep visual cohesion, matching the WorkoutPlan segment
 *    structure.
 *  • Execution order is strictly preserved — superset blocks and straight-set
 *    blocks interleave exactly as the engine will run them.
 */
export function groupExercisesIntoSections(
  exercises: EngineWorkoutExercise[],
): ExerciseSection[] {
  const byId = new Map<string, EngineWorkoutExercise>();
  for (const ex of exercises) {
    byId.set(ex.exercise.id, ex);
  }

  const warmup: EngineWorkoutExercise[] = [];
  const cooldown: EngineWorkoutExercise[] = [];
  const main: EngineWorkoutExercise[] = [];

  for (const ex of exercises) {
    const role = ex.exerciseRole || (ex.exercise as any).exerciseRole;
    if (VERBOSE_GROUP_LOG) {
      console.log(
        `[UI][groupSections] exercise="${exDisplayName(ex)}" role=${role ?? 'none'} ` +
        `pairedWith=${ex.pairedWith ?? 'NONE'}`,
      );
    }
    if (role === 'warmup') warmup.push(ex);
    else if (role === 'cooldown') cooldown.push(ex);
    else main.push(ex);
  }

  const consumed = new Set<string>();
  const mainSections: ExerciseSection[] = [];
  let supersetCounter = 0;
  let pyramidCounter = 0;

  for (const ex of main) {
    if (consumed.has(ex.exercise.id)) continue;

    const pairedId = ex.pairedWith as string | null | undefined;

    // Pyramid detection — pyramids are mechanical-only (every step
    // mutates the lever), so a `pyramidSequence` is the single source
    // of truth.  `repsSequence` alone is NOT enough to qualify.
    const isPyramidExercise =
      Array.isArray((ex as any).pyramidSequence) && (ex as any).pyramidSequence.length > 0;

    if (pairedId) {
      const partner = byId.get(pairedId);
      const partnerPairedId = partner?.pairedWith as string | null | undefined;
      const isMutualPair = !!partner && partnerPairedId === ex.exercise.id;

      if (isMutualPair) {
        consumed.add(partner!.exercise.id);
        // Fix 3 — Superset Set Equalization: both cards must share the same
        // set count so the state machine never triggers an undefined index.
        const equalizedRounds = Math.max(ex.sets || 3, partner!.sets || 3);
        mainSections.push({
          id: `superset-${supersetCounter++}`,
          title: 'סופר סט',
          rounds: equalizedRounds,
          exercises: [ex, partner!],
        });
        if (VERBOSE_GROUP_LOG) {
          console.log(
            `[UI][groupSections] ✅ Superset pair: "${exDisplayName(ex)}" ↔ "${exDisplayName(partner!)}" (rounds=${equalizedRounds})`,
          );
        }
      } else {
        // pairedWith set but partner missing or no mutual back-link → straight set.
        // Always warn — this signals a real data-integrity bug, not noisy tracing.
        console.warn(
          `[UI][groupSections] ⚠️ "${exDisplayName(ex)}" has pairedWith="${pairedId}" but ` +
          `${!partner
            ? 'partner not found in exercise list'
            : `partner "${exDisplayName(partner)}" does not point back (${partnerPairedId ?? 'NONE'})`
          }. Emitting as straight set.`,
        );
        mainSections.push({
          id: `regular-${mainSections.length}`,
          title: isPyramidExercise
            ? pyramidLabel((ex as any).pyramidSequence)
            : 'סט רגיל',
          rounds: ex.sets || 3,
          exercises: [ex],
        });
      }
    } else if (isPyramidExercise) {
      // Each pyramid exercise is its own distinct block — one exercise,
      // one section.  Never merge separate pyramid exercises into a single
      // mega-block: they represent different movement progressions.
      mainSections.push({
        id: `pyramid-${pyramidCounter++}`,
        title: pyramidLabel((ex as any).pyramidSequence),
        rounds: ex.sets || 3,
        exercises: [ex],
      });
      if (VERBOSE_GROUP_LOG) {
        console.log(
          `[UI][groupSections] 🔺 Pyramid: "${exDisplayName(ex)}" (${((ex as any).pyramidSequence as any[]).length} steps)`,
        );
      }
    } else {
      mainSections.push({
        id: `regular-${mainSections.length}`,
        title: 'סט רגיל',
        rounds: ex.sets || 3,
        exercises: [ex],
      });
    }
  }

  const sections: ExerciseSection[] = [];
  if (warmup.length > 0) {
    sections.push({ id: 'warmup', title: 'חימום', rounds: 1, exercises: warmup });
  }
  sections.push(...mainSections);
  if (cooldown.length > 0) {
    sections.push({ id: 'cooldown', title: 'מתיחות', rounds: 1, exercises: cooldown });
  }

  if (VERBOSE_GROUP_LOG) {
    const pairCount = mainSections.filter((s) => s.id.startsWith('superset')).length;
    const pyramidCount = mainSections.filter((s) => s.id.startsWith('pyramid')).length;
    const straightCount = mainSections.filter((s) => s.id.startsWith('regular')).length;
    console.log(
      `[UI][groupSections] result — warmup:${warmup.length} pairs:${pairCount} ` +
      `pyramids:${pyramidCount} straight:${straightCount} cooldown:${cooldown.length}`,
    );
  }

  return sections;
}
