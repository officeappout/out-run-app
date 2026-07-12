/**
 * workout-plan.mapper — GeneratedWorkout → runnable WorkoutPlan
 * (extracted VERBATIM from home/page.tsx openWorkoutPreview, 13.07.2026).
 *
 * WHY SHARED: the custom builder's WorkoutPreviewDrawer used to hold the
 * generated workout only as a React prop — NOBODY serialized it, so
 * "התחל אימון" re-stamped whatever stale plan the HOME flow had left in
 * sessionStorage (the dashboard trio, always generated at 60min → bolt
 * cap). The runner executed the wrong workout under the builder's id.
 * Now both the home flow and the drawer hand-off build the plan from the
 * SAME mapper — the generated truth, never storage leftovers. This also
 * gives the builder path seg-tabata support for free.
 *
 * Pure TS (no React, no Firebase) — node-env unit-testable.
 */
import type { GeneratedWorkout } from '../logic/workout-generator.types';
// Deep import on purpose — the exercises barrel re-exports admin TSX, and
// this module runs in node-env tests (same convention as gear-mapping.utils).
import { getLocalizedText as glt } from '@/features/content/shared/localized-text.types';
import { resolveExerciseMedia } from '../shared/utils/media-resolution.utils';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';
import { partitionByTabataBlock } from '../logic/protocols/tabata.block';
import { inferSegmentProtocol } from '../players/strength/protocols/advance-registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function buildWorkoutPlanFromGenerated(
  gw: GeneratedWorkout,
  workoutId: string,
  location?: string,
): Record<string, any> {
  const exercises = gw.exercises.map((ex) => {
    const resolveHighlights = (): string[] => {
      const methodHighlights = ex.method?.highlights;
      if (Array.isArray(methodHighlights) && methodHighlights.length > 0) {
        return methodHighlights.map((h: any) =>
          typeof h === 'string' ? h : (h?.male || h?.female || ''),
        ).filter(Boolean);
      }
      const contentHighlights = ex.exercise.content?.highlights;
      if (Array.isArray(contentHighlights) && contentHighlights.length > 0) {
        return contentHighlights;
      }
      const instr = ex.exercise.content?.instructions;
      if (instr) {
        const txt = typeof instr === 'string' ? instr : (instr as any)?.he || (instr as any)?.en || '';
        if (txt) return txt.split(/[.\n]/).map((s: string) => s.trim()).filter(Boolean);
      }
      return [];
    };

    const resolveGoal = (): string => {
      if (ex.exercise.content?.goal) return ex.exercise.content.goal;
      const desc = ex.exercise.content?.description;
      if (desc) {
        return typeof desc === 'string' ? desc : (desc as any)?.he || (desc as any)?.en || '';
      }
      return '';
    };

    const primaryMuscle = ex.exercise.primaryMuscle;
    const secondaryMuscles = ex.exercise.secondaryMuscles;
    const legacyMuscleGroups = ex.exercise.muscleGroups || [];
    const muscleGroups = legacyMuscleGroups.length > 0
      ? legacyMuscleGroups
      : [primaryMuscle, ...(secondaryMuscles || [])].filter(Boolean);

    // Unit priority: respect the admin's explicit type field first, then generator's isTimeBased
    const actuallyTimeBased = ex.exercise.type === 'time' || ex.isTimeBased;

    const { videoUrl: resolvedVideoUrl, imageUrl: resolvedImageUrl, fullTutorial: resolvedFullTutorial } =
      resolveExerciseMedia(ex.exercise as any, ex.method as any);

    if (!resolvedImageUrl && !resolvedVideoUrl) {
      const allMethods = ex.exercise.execution_methods || ex.exercise.executionMethods || [];
      console.error(`[Media FAIL] No media found for exercise: ${glt(ex.exercise.name)} (${ex.exercise.id}), method: ${ex.method?.methodName || 'none'}, allMethods: ${allMethods.length}`);
    }

    // Hebrew grammar: '1 חזרה' not '1 חזרות'
    const fmtReps = (n: number) => (n === 1 ? 'חזרה אחת' : `${n} חזרות`);
    const fmtSecs = (n: number) => (n === 1 ? 'שנייה אחת' : `${n} שניות`);

    return {
      id: ex.exercise.id,
      name: glt(ex.exercise.name),
      reps: actuallyTimeBased ? undefined : (
        ex.repsRange && ex.repsRange.min !== ex.repsRange.max
          ? `${ex.repsRange.min}-${ex.repsRange.max} חזרות`
          : fmtReps(ex.reps)
      ),
      duration: actuallyTimeBased ? (
        ex.repsRange && ex.repsRange.min !== ex.repsRange.max
          ? `${ex.repsRange.min}-${ex.repsRange.max} שניות`
          : fmtSecs(ex.reps)
      ) : undefined,
      videoUrl: resolvedVideoUrl,
      imageUrl: resolvedImageUrl,
      fullTutorial: resolvedFullTutorial ?? null,
      exerciseType: actuallyTimeBased ? 'time' as const : 'reps' as const,
      exerciseRole: (ex.exercise.exerciseRole as 'main' | 'warmup' | 'cooldown' | 'recovery') || 'main' as const,
      isFollowAlong: ex.exercise.isFollowAlong ?? false,
      hasAudio: false,
      highlights: resolveHighlights(),
      muscleGroups,
      goal: resolveGoal(),
      description: resolveGoal(),
      equipment: (() => {
        const raw = [
          ...(ex.method?.equipmentIds || []),
          ...(ex.method?.gearIds || []),
          ...(ex.method?.gearId ? [ex.method.gearId] : []),
          ...(ex.method?.equipmentId ? [ex.method.equipmentId] : []),
        ].filter(Boolean);
        const seen = new Set<string>();
        const finalEquipment: string[] = [];
        for (const id of raw) {
          const norm = normalizeGearId(id);
          if (norm !== 'none' && norm !== 'bodyweight' && !seen.has(norm)) {
            seen.add(norm);
            finalEquipment.push(norm);
          }
        }
        console.log('[Final Equipment Flow]', glt(ex.exercise.name), finalEquipment);
        return finalEquipment;
      })(),
      restSeconds: ex.restSeconds,
      repsRange: ex.repsRange,
      isGoalExercise: ex.isGoalExercise,
      rampedTarget: ex.rampedTarget,
      isTimeBased: actuallyTimeBased,
      sets: ex.sets,
      execution_methods: ex.exercise.execution_methods || ex.exercise.executionMethods || [],
      reasoning: ex.reasoning,
      pairedWith: ex.pairedWith ?? null,
      symmetry: ex.exercise.symmetry ?? null,
      programIds: (() => {
        const fromTargets = (ex.exercise.targetPrograms ?? [])
          .map((tp: any) => tp.programId)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        const fromIds = (ex.exercise.programIds ?? [])
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        return Array.from(new Set([...fromTargets, ...fromIds]));
      })(),
      pyramidSequence: (ex as any).pyramidSequence ?? undefined,
      repsSequence: (ex as any).repsSequence ?? undefined,
    };
  });

  const warmupExercises = exercises.filter((ex: any) => ex.exerciseRole === 'warmup');
  const allMainExercises = exercises.filter((ex: any) => ex.exerciseRole === 'main' || !ex.exerciseRole);
  const cooldownExercises = exercises.filter((ex: any) => ex.exerciseRole === 'cooldown');
  const recoveryExercises = exercises.filter((ex: any) => ex.exerciseRole === 'recovery');

  // Stage 3.1: generator-decided tabata block → its own segment. Plan-level
  // fields (appliedProtocol/blastMode) never reach the player; the SEGMENT
  // is the only channel the runner executes. Defensive partition dissolves
  // a degenerate block (<2 members after swaps) back into seg-main.
  const { tabata: tabataExercises, rest: mainExercises } =
    partitionByTabataBlock(allMainExercises, gw.tabataBlock);

  const segments: any[] = [];
  if (warmupExercises.length > 0) {
    segments.push({
      id: 'seg-warmup',
      type: 'station' as const,
      title: 'חימום',
      icon: '🔥',
      target: { type: 'reps' as const, value: 12 },
      exercises: warmupExercises,
      isCompleted: false,
      restBetweenExercises: 5,
      protocol: 'straight' as const,
      kind: 'strength' as const,
    });
  }
  if (mainExercises.length > 0) {
    segments.push({
      id: 'seg-main',
      type: 'station' as const,
      title: gw.title || 'אימון כוח',
      icon: '💪',
      target: { type: 'reps' as const, value: 12 },
      exercises: mainExercises,
      isCompleted: false,
      restBetweenExercises: 10,
      protocol: inferSegmentProtocol(mainExercises),
      kind: 'strength' as const,
    });
  }
  if (tabataExercises.length > 0 && gw.tabataBlock) {
    const tabataCfg = gw.tabataBlock.config;
    // Smoke anchor: proves the block survived generation → plan-build.
    console.log(
      `[TabataBlock] 🔥 seg-tabata built: ${tabataExercises.length} exercises, ` +
      `${tabataCfg.workSec}/${tabataCfg.restSec}×${tabataCfg.rounds} — [${tabataExercises.map((e: any) => e.name).join(', ')}]`,
    );
    segments.push({
      id: 'seg-tabata',
      type: 'station' as const,
      title: 'טבטה — פיניש',
      icon: '🔥',
      target: { type: 'time' as const, value: (tabataCfg.workSec + tabataCfg.restSec) * tabataCfg.rounds },
      exercises: tabataExercises,
      isCompleted: false,
      // In-block rest is the CLOCK's job (config.restSec via RESTING) —
      // restBetweenExercises must not add a second rest layer.
      restBetweenExercises: 0,
      protocol: 'tabata' as const,
      protocolConfig: tabataCfg,
      kind: 'strength' as const,
    });
  }
  if (cooldownExercises.length > 0) {
    segments.push({
      id: 'seg-cooldown',
      type: 'station' as const,
      title: 'מתיחות',
      icon: '🧘',
      target: { type: 'reps' as const, value: 12 },
      exercises: cooldownExercises,
      isCompleted: false,
      restBetweenExercises: 5,
      protocol: 'straight' as const,
      kind: 'strength' as const,
    });
  }
  if (recoveryExercises.length > 0) {
    segments.push({
      id: 'seg-recovery',
      type: 'station' as const,
      title: gw.title || 'שיקום',
      icon: '🌙',
      target: { type: 'time' as const, value: 600 },
      exercises: recoveryExercises,
      isCompleted: false,
      restBetweenExercises: 0,
      protocol: 'straight' as const,
      kind: 'strength' as const,
    });
  }
  if (segments.length === 0) {
    segments.push({
      id: 'seg-all',
      type: 'station' as const,
      title: gw.title || 'אימון כוח',
      icon: '💪',
      target: { type: 'reps' as const, value: 12 },
      exercises,
      isCompleted: false,
      restBetweenExercises: 10,
      protocol: inferSegmentProtocol(exercises),
      kind: 'strength' as const,
    });
  }

  return {
    id: workoutId,
    name: gw.title || 'אימון כוח',
    description: gw.description || '',
    logicCue: gw.logicCue || '',
    segments,
    totalDuration: gw.estimatedDuration || 30,
    difficulty: gw.difficulty === 1 ? 'easy' as const : gw.difficulty === 3 ? 'hard' as const : 'medium' as const,
    trainingType: 'strength' as const,
    pipelineLog: gw.pipelineLog,
    // Protocol fields — preserved across the GeneratedWorkout → WorkoutPlan
    // boundary so the active workout state machine can adapt execution flow.
    appliedProtocol: gw.appliedProtocol,
    blastMode: gw.blastMode,
    ...(location ? { workoutLocation: location } : {}),
  };
}

// ============================================================================
// START HAND-OFF RESOLUTION (pure — unit-tested)
// ============================================================================

export type StartHandOff =
  | { source: 'generated' | 'stored' | 'legacy'; plan: Record<string, any> }
  | { source: 'none'; plan: null };

/**
 * Decide WHICH plan "התחל אימון" hands the runner. Precedence:
 *   1. generated — the live GeneratedWorkout the drawer is rendering
 *      (built fresh via the shared mapper — the source of truth);
 *   2. stored    — a valid plan already in active_workout_data (home flow
 *      fallback when no generated payload was supplied);
 *   3. legacy    — the drawer's skeleton plan (favorites flow only);
 *   4. none      — nothing to hand off (runner falls back to Firestore).
 */
export function resolveStartHandOff(args: {
  generatedWorkout: GeneratedWorkout | null | undefined;
  storedActivePlanJson: string | null;
  legacyPlan: Record<string, any> | null;
  workoutId: string;
  isWarmupActive: boolean;
  location?: string;
}): StartHandOff {
  const { generatedWorkout, storedActivePlanJson, legacyPlan, workoutId, isWarmupActive, location } = args;

  if (generatedWorkout?.exercises?.length) {
    const plan = buildWorkoutPlanFromGenerated(generatedWorkout, workoutId, location);
    return { source: 'generated', plan: { ...plan, isWarmupActive } };
  }

  if (storedActivePlanJson) {
    try {
      const parsed = JSON.parse(storedActivePlanJson);
      if (Array.isArray(parsed?.segments) && parsed.segments.length > 0) {
        return { source: 'stored', plan: { ...parsed, id: workoutId, isWarmupActive } };
      }
    } catch {
      console.error('[workout-plan.mapper] Corrupt active_workout_data — ignoring');
    }
  }

  if (legacyPlan) {
    return { source: 'legacy', plan: { ...legacyPlan, id: workoutId, isWarmupActive } };
  }

  return { source: 'none', plan: null };
}
