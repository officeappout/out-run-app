/**
 * buildRunnerWorkoutPlanFromGenerated
 * ------------------------------------
 * Converts a `GeneratedWorkout` (the WorkoutGenerator / CustomBuilder output
 * shape — a flat `exercises: WorkoutExercise[]` list) into the legacy
 * `WorkoutPlan` (segment-based) shape that the active-workout player
 * (`StrengthRunner` → `useWorkoutStateMachine`) consumes.
 *
 * WHY THIS EXISTS
 *   The runner reads its plan from sessionStorage as a `WorkoutPlan`. The home
 *   dashboard already performs this exact conversion inline before writing
 *   `active_workout_data` (see `src/app/home/page.tsx` `openWorkoutPreview`).
 *   The custom-builder flow (WorkoutBuilderSheet → WorkoutPreviewDrawer) had NO
 *   such conversion in its start hand-off, so tapping "start" fell through to a
 *   STALE `active_workout_data` snapshot and ran a different workout than the
 *   one the CustomBuilder synthesised and the preview displayed.
 *
 *   This module is a faithful, side-effect-free extraction of the home path's
 *   mapping so the custom-builder hand-off produces a byte-identical plan to the
 *   one the runner already handles correctly. Pure function: no React, no
 *   Firebase, no sessionStorage (LAW 0 — engine purity).
 *
 *   NOTE: `src/app/home/page.tsx` still carries the original inline copy of this
 *   mapping. Consolidating that call site onto this util is a follow-up cleanup
 *   (kept out of this fix to avoid touching the flagship home generation path).
 */
import type {
  GeneratedWorkout,
  WorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import type { WorkoutPlan } from '@/features/parks';
// Leaf import (not the `@/features/content/exercises` barrel) — keeps this pure
// engine util free of the heavy admin/component graph the barrel pulls in.
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { partitionByTabataBlock } from './protocols/tabata.block';

interface BuildOpts {
  /** The plan id the runner will key on (route param + sessionStorage id). */
  id: string;
}

/**
 * Pure conversion — mirrors `src/app/home/page.tsx` `openWorkoutPreview` exactly.
 * Returns a `WorkoutPlan` ready to serialise into the start hand-off.
 */
export function buildRunnerWorkoutPlanFromGenerated(
  gw: GeneratedWorkout,
  opts: BuildOpts,
): WorkoutPlan {
  const glt = getLocalizedText;

  const exercises = (gw.exercises ?? []).map((ex: WorkoutExercise) => {
    const resolveHighlights = (): string[] => {
      const methodHighlights = (ex.method as any)?.highlights;
      if (Array.isArray(methodHighlights) && methodHighlights.length > 0) {
        return methodHighlights
          .map((h: any) => (typeof h === 'string' ? h : h?.male || h?.female || ''))
          .filter(Boolean);
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

    const primaryMuscle = (ex.exercise as any).primaryMuscle;
    const secondaryMuscles = (ex.exercise as any).secondaryMuscles;
    const legacyMuscleGroups = (ex.exercise as any).muscleGroups || [];
    const muscleGroups = legacyMuscleGroups.length > 0
      ? legacyMuscleGroups
      : [primaryMuscle, ...(secondaryMuscles || [])].filter(Boolean);

    // Unit priority: respect the admin's explicit type field first, then generator's isTimeBased
    const actuallyTimeBased = ex.exercise.type === 'time' || ex.isTimeBased;

    // Resolve media off the ENGINE-SELECTED method (`ex.method`) — NOT method[0].
    // We carry `bunnyVideoId` onto the flat exercise (unlike home/page.tsx, which
    // drops it) so the runner's `exerciseBunnyVideoId` derivation returns THIS id
    // directly instead of re-deriving from `execution_methods[0]` and playing the
    // wrong method's video. Mirrors the hybrid path (strength-block-to-plan.ts).
    const {
      videoUrl: resolvedVideoUrl,
      imageUrl: resolvedImageUrl,
      fullTutorial: resolvedFullTutorial,
      bunnyVideoId: resolvedBunnyVideoId,
    } = resolveExerciseMedia(ex.exercise as any, ex.method as any);

    if (!resolvedImageUrl && !resolvedVideoUrl) {
      const allMethods = (ex.exercise as any).execution_methods || (ex.exercise as any).executionMethods || [];
      console.error(`[Media FAIL] No media found for exercise: ${glt(ex.exercise.name)} (${ex.exercise.id}), method: ${(ex.method as any)?.methodName || 'none'}, allMethods: ${allMethods.length}`);
    }

    // Hebrew grammar: '1 חזרה' not '1 חזרות'
    const fmtReps = (n: number) => (n === 1 ? 'חזרה אחת' : `${n} חזרות`);
    const fmtSecs = (n: number) => (n === 1 ? 'שנייה אחת' : `${n} שניות`);
    // Follow-along VIDEO items carry their real length on the execution method
    // (media.videoDurationSeconds). Their `reps` is a placeholder — the recovery
    // trio builder hardcodes reps:1 — so deriving the duration text from reps
    // renders "שנייה אחת" for a 14-minute clip. Video items read the clip length;
    // rep-based exercises keep the existing reps-derived text untouched.
    const fmtClip = (s: number) => (s >= 60 ? `${Math.round(s / 60)} דקות` : fmtSecs(s));
    const clipSeconds = Number((ex.method as any)?.media?.videoDurationSeconds) || 0;
    const useClipDuration = Boolean((ex.exercise as any).isFollowAlong) && clipSeconds > 0;

    return {
      id: ex.exercise.id,
      name: glt(ex.exercise.name),
      reps: actuallyTimeBased ? undefined : (
        ex.repsRange && ex.repsRange.min !== ex.repsRange.max
          ? `${ex.repsRange.min}-${ex.repsRange.max} חזרות`
          : fmtReps(ex.reps)
      ),
      duration: actuallyTimeBased ? (
        useClipDuration
          ? fmtClip(clipSeconds)
          : ex.repsRange && ex.repsRange.min !== ex.repsRange.max
            ? `${ex.repsRange.min}-${ex.repsRange.max} שניות`
            : fmtSecs(ex.reps)
      ) : undefined,
      videoUrl: resolvedVideoUrl,
      imageUrl: resolvedImageUrl,
      // Engine-selected method's Bunny id — carried so the runner does not
      // re-derive it from execution_methods[0] (wrong method → wrong video).
      bunnyVideoId: resolvedBunnyVideoId,
      fullTutorial: resolvedFullTutorial ?? null,
      exerciseType: actuallyTimeBased ? 'time' as const : 'reps' as const,
      exerciseRole: ((ex.exercise as any).exerciseRole as 'main' | 'warmup' | 'cooldown' | 'recovery') || 'main' as const,
      isFollowAlong: (ex.exercise as any).isFollowAlong ?? false,
      hasAudio: false,
      highlights: resolveHighlights(),
      muscleGroups,
      goal: resolveGoal(),
      description: resolveGoal(),
      equipment: (() => {
        const raw = [
          ...((ex.method as any)?.equipmentIds || []),
          ...((ex.method as any)?.gearIds || []),
          ...((ex.method as any)?.gearId ? [(ex.method as any).gearId] : []),
          ...((ex.method as any)?.equipmentId ? [(ex.method as any).equipmentId] : []),
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
        return finalEquipment;
      })(),
      restSeconds: ex.restSeconds,
      repsRange: ex.repsRange,
      isGoalExercise: ex.isGoalExercise,
      rampedTarget: ex.rampedTarget,
      isTimeBased: actuallyTimeBased,
      sets: ex.sets,
      execution_methods: (ex.exercise as any).execution_methods || (ex.exercise as any).executionMethods || [],
      reasoning: ex.reasoning,
      pairedWith: ex.pairedWith ?? null,
      symmetry: (ex.exercise as any).symmetry ?? null,
      programIds: (() => {
        const fromTargets = ((ex.exercise as any).targetPrograms ?? [])
          .map((tp: any) => tp.programId)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        const fromIds = ((ex.exercise as any).programIds ?? [])
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

  // Tabata graft (David 26.07): the generator injects a conditioning finisher
  // (protocolBlock='tabata' members + gw.tabataBlock spec). Split them into their
  // own seg-tabata so the runner runs the INTERVAL format — otherwise they fall
  // into seg-main and render as plain strength (no timer/X-8/rest). Mirror of the
  // workout-plan.mapper seg-tabata step; degenerate (<2 after swaps) dissolves back.
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
    });
  }
  if (tabataExercises.length > 0 && gw.tabataBlock) {
    const tabataCfg = gw.tabataBlock.config;
    console.log(
      `[TabataBlock] 🔥 seg-tabata built (runner mapper): ${tabataExercises.length} exercises, ` +
      `${tabataCfg.workSec}/${tabataCfg.restSec}×${tabataCfg.rounds}`,
    );
    segments.push({
      id: 'seg-tabata',
      type: 'station' as const,
      title: 'טבטה — פיניש',
      icon: '🔥',
      target: { type: 'time' as const, value: (tabataCfg.workSec + tabataCfg.restSec) * tabataCfg.rounds },
      exercises: tabataExercises,
      isCompleted: false,
      // In-block rest is the CLOCK's job (config.restSec via RESTING) — a second
      // restBetweenExercises layer must not stack on top.
      restBetweenExercises: 0,
      protocol: 'tabata' as const,
      protocolConfig: tabataCfg,
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
    });
  }

  const workoutPlan = {
    id: opts.id,
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
    // Recovery flag — kept in parity with the home inline flatten so the
    // custom-builder hand-off carries it too (see src/app/home/page.tsx).
    isRecovery: gw.isRecovery ?? false,
    // Fix (02.09.2026): without this, useActivitySync's `totalPlannedSets ?? actualSetsCompleted`
    // fallback collapses plannedSets to exactly actualSetsCompleted for every normal "press Start"
    // session (this function, not openWorkoutPreview's own inline workoutPlan, is what
    // useWorkoutSession.handleStartWorkout actually uses whenever a real generatedWorkout exists —
    // see openWorkoutPreview's own workoutPlan.totalPlannedSets for the sibling fix this mirrors),
    // making setsCompleted === setsPlanned always true and partial-completion.generator.ts's
    // eligible() structurally unable to ever fire, regardless of what the user actually completes.
    totalPlannedSets: gw.totalPlannedSets,
  };

  return workoutPlan as unknown as WorkoutPlan;
}
