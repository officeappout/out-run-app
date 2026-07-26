'use client';

/**
 * useSwapAll — the bulk "swap all → <value>" engine for the preview drawer.
 *
 * Preserves the "what" (exercise choices, levels, domains, sets/reps intent) and
 * recomputes only the "where/how" for a new dimension-value (Phase 1 = location).
 * NOT a regeneration. Per exercise, the null-rule:
 *   0. a pyramid (has `pyramidSequence`) is ATOMIC — never partial-swapped. Its rendered
 *      content lives in the per-step sequence, which a shell-level swap does NOT
 *      re-derive; swapping only the parent would leave a new parent with STALE steps.
 *      Kept as ONE unit + marked, whether or not the parent is performable. (Follow-up
 *      B: per-step method/media re-resolution — see `.claude/knowledge/parking-lot.md`.)
 *   1. a qualifying method (complete media) at the new value → swap the METHOD in place.
 *   2. none → replace the exercise with a same-level alternative that has complete media.
 *   2.5 still none, but the exercise IS performable at the new location (a valid method
 *       exists — it only failed the STRICT complete-media gate) → swap that method in
 *       anyway. A possibly-missing still beats a FALSE "requires station" badge on an
 *       exercise that needs no station.
 *   3. not performable at the new location at all (`selectMethodForContext` → null) →
 *      KEEP it and MARK it (`dimensionUnavailable`, "דורש מתקן" badge). Genuine
 *      equipment gaps ONLY — never a media/content gap.
 * Then a two-pass superset heal, a cheap duration/stats recompute, and (from the light
 * metadataCtx snapshot) a title/description refresh for the new location — assembled
 * into ONE `onGeneratedWorkoutUpdate` so it reaches the runner via Merge 1's converter.
 *
 * Gated by SWAP_ALL_ENABLED at the call sites (this hook is inert unless invoked).
 */

import { useCallback, useState } from 'react';
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import { methodHasCompleteMedia } from '@/features/content/exercises/core/exercise.types';
import type {
  GeneratedWorkout,
  WorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { selectMethodForContext } from '@/features/workout-engine/shared/utils/method-selection.utils';
import type { SwapDimension } from '@/features/workout-engine/shared/utils/method-dimension.utils';
import { deriveSwappedEntry } from '../utils/derive-swapped-entry.util';
import { getAlternativeExercises } from '@/features/workout-engine/generator/services/exercise-replacement.service';
import { normalizeEquipmentArray } from '@/features/workout-engine/core/middleware/InputSanitizerMiddleware';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { resolveWorkoutContext } from '@/features/workout-engine/services/workout-context-resolver';
import {
  calculateEstimatedDuration,
  calculateWorkoutStats,
} from '@/features/workout-engine/logic/workout-budgeting.utils';
import {
  resolveWorkoutMetadata,
  type WorkoutMetadataContext,
  type TimeOfDay,
} from '@/features/workout-engine/services/workout-metadata.service';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';

interface UseSwapAllParams {
  generatedWorkout: GeneratedWorkout | null | undefined;
  onGeneratedWorkoutUpdate?: (gw: GeneratedWorkout) => void;
  userProfile: UserFullProfile | null | undefined;
  /** The workout's current location — a swap to the same value is a no-op. */
  currentLocation: ExecutionLocation;
  /** Drawer's prefetched pool — reused so a bulk swap does 0 extra full-collection reads. */
  exercisePool?: Exercise[];
}

export interface SwapAllResult {
  swappedMethod: number;
  swappedExercise: number;
  keptMarked: number;
}

interface UseSwapAllReturn {
  swapAll: (dimension: SwapDimension, value: string) => Promise<void>;
  isSwapping: boolean;
  lastResult: SwapAllResult | null;
}

export function useSwapAll({
  generatedWorkout,
  onGeneratedWorkoutUpdate,
  userProfile,
  currentLocation,
  exercisePool,
}: UseSwapAllParams): UseSwapAllReturn {
  const [isSwapping, setIsSwapping] = useState(false);
  const [lastResult, setLastResult] = useState<SwapAllResult | null>(null);

  const swapAll = useCallback(
    async (dimension: SwapDimension, value: string) => {
      if (!generatedWorkout || !userProfile) return;
      // Phase 1 supports the location dimension only.
      if (dimension !== 'location') return;
      const newLocation = value as ExecutionLocation;
      if (newLocation === currentLocation) return;

      setIsSwapping(true);
      try {
        // ── Resolve gear for the new location — SAME source as generation ──
        await ensureEquipmentCachesLoaded();
        const gymList = await getAllGymEquipment();
        let parkGear: string[] | undefined;
        if (newLocation === 'park' || newLocation === 'street') {
          parkGear = (await resolveWorkoutContext(userProfile, newLocation, {})).availableGear;
        }
        const gear = normalizeEquipmentArray(userProfile, newLocation, parkGear, gymList);

        // ── Per-exercise null-rule (sequential: exclude set grows per replacement) ──
        const exclude = new Set<string>(generatedWorkout.exercises.map((e) => e.exercise.id));
        const oldToNew = new Map<string, string>();
        let swappedMethod = 0;
        let swappedExercise = 0;
        let keptMarked = 0;

        const newEntries: WorkoutExercise[] = [];
        for (const we of generatedWorkout.exercises) {
          // ── Role awareness (R Track 1 item 3) ──────────────────────────────
          // Warmup/cooldown blocks hold TWO kinds:
          //   (a) follow-along guides — one location-agnostic video, no methods to
          //       swap. Keep as-is and do NOT mark dimensionUnavailable (they have
          //       no gear gap to flag — a badge here is always false).
          //   (b) preparation exercises — ordinary low-level exercises WITH methods.
          //       Swap them like a main, but the level ladder (step 2) must never
          //       pull in a HIGHER-level exercise: prep is deliberately low-level,
          //       and getAlternativeExercises' ±3 window is symmetric.
          const role = we.exerciseRole;
          const isWarmupOrCooldown = role === 'warmup' || role === 'cooldown';
          const methodCount =
            (we.exercise.execution_methods ?? we.exercise.executionMethods ?? []).length;
          if (isWarmupOrCooldown && we.exercise.isFollowAlong === true && methodCount <= 1) {
            // (a) follow-along guide → skip untouched, no mark.
            newEntries.push(we);
            continue;
          }
          // `allowHigherLevel` is the only behavioural change for (b): warmup/cooldown
          // preparation entries forbid a higher-level replacement; mains keep today's
          // behaviour exactly.
          const allowHigherLevel = !isWarmupOrCooldown;
          // 0) Pyramids are ATOMIC for a location swap (Phase 1, Option A). The rendered
          //    content lives in `pyramidSequence[]` (per-step lever variants), which this
          //    shell-level swap does NOT re-derive — a partial swap would leave a new
          //    parent with STALE steps (inconsistent). Never partial-swap: keep the whole
          //    block as one unit + mark it, performable or not. Follow-up B re-resolves
          //    each step for the new location (see parking-lot.md).
          if (Array.isArray(we.pyramidSequence) && we.pyramidSequence.length > 0) {
            newEntries.push({ ...we, dimensionUnavailable: { dimension, value } });
            keptMarked++;
            continue;
          }
          // 1) Method swap in place (same exercise, new-location method).
          const m = selectMethodForContext(we.exercise, newLocation, gear);
          if (m && methodHasCompleteMedia(m)) {
            newEntries.push(deriveSwappedEntry(we, we.exercise, m));
            swappedMethod++;
            continue;
          }
          // 2) Replace the exercise with a same-level alternative that has complete media.
          const level = we.programLevel ?? we.exercise.targetPrograms?.[0]?.level ?? 1;
          const alts = await getAlternativeExercises(
            we.exercise,
            level,
            newLocation,
            null,
            userProfile,
            undefined,
            exclude,
            exercisePool,
          );
          const pick =
            alts.find(
              (a) => a.levelComparison === 'same' && methodHasCompleteMedia(a.selectedExecutionMethod),
            ) ??
            (allowHigherLevel
              ? alts.find((a) => methodHasCompleteMedia(a.selectedExecutionMethod))
              : alts.find(
                  (a) =>
                    a.levelComparison === 'lower' && methodHasCompleteMedia(a.selectedExecutionMethod),
                ));
          if (pick && pick.selectedExecutionMethod) {
            newEntries.push(deriveSwappedEntry(we, pick.exercise, pick.selectedExecutionMethod));
            exclude.add(pick.exercise.id);
            oldToNew.set(we.exercise.id, pick.exercise.id);
            swappedExercise++;
            continue;
          }
          // 2.5) Last resort BEFORE keep+mark: the exercise IS performable at the new
          //      location (`m` is a valid location method) — it only failed the strict
          //      complete-media gate and no complete-media alternative was found. Swap
          //      that method in anyway: a thumbnail that may lack its still image is far
          //      better than a FALSE "דורש מתקן" badge on an exercise that needs no
          //      station. This also keeps `collectEquipment` honest — the kept entry no
          //      longer leaks the OLD location's gear into the workout equipment list.
          if (m) {
            newEntries.push(deriveSwappedEntry(we, we.exercise, m));
            swappedMethod++;
            continue;
          }
          // 3) Keep + mark — genuine equipment gap ONLY (no viable method here at all).
          newEntries.push({ ...we, dimensionUnavailable: { dimension, value } });
          keptMarked++;
        }

        // ── Two-pass superset heal: re-point pairedWith across all replacements ──
        const healed = newEntries.map((e) => {
          const link = e.pairedWith;
          if (link && oldToNew.has(link)) return { ...e, pairedWith: oldToNew.get(link)! };
          return e;
        });

        // ── Cascade: duration + stats (pure; volume-preserving swaps leave these unchanged) ──
        const estimatedDuration = calculateEstimatedDuration(healed);
        // userWeight omitted: a location swap must not silently change the calorie basis;
        // the engine's default is used, matching a volume-preserving swap.
        const stats = calculateWorkoutStats(healed, generatedWorkout.difficulty, estimatedDuration);

        // ── Cascade: title/description/aiCue for the new location (defensive) ──
        let title = generatedWorkout.title;
        let description = generatedWorkout.description;
        let aiCue = generatedWorkout.aiCue;
        const snap = generatedWorkout.metadataCtx;
        if (snap) {
          try {
            const ctx: WorkoutMetadataContext = {
              persona: (snap.persona ?? null) as LifestylePersona | null,
              timeOfDay: (snap.timeOfDay as TimeOfDay) ?? 'evening',
              gender: snap.gender,
              category: snap.category,
              categoryLabel: snap.categoryLabel,
              difficulty: snap.difficulty,
              dominantMuscle: snap.dominantMuscle,
              experienceLevel: snap.experienceLevel,
              sportType: snap.sportType,
              motivationStyle: snap.motivationStyle,
              currentProgram: snap.currentProgram,
              location: newLocation,
              durationMinutes: estimatedDuration,
            };
            const md = await resolveWorkoutMetadata(ctx);
            if (md.title) title = md.title;
            if (md.description) description = md.description;
            if (md.aiCue) aiCue = md.aiCue;
          } catch (err) {
            console.warn('[swapAll] metadata recompute failed — keeping existing title', err);
          }
        }

        const updated: GeneratedWorkout = {
          ...generatedWorkout,
          exercises: healed,
          estimatedDuration,
          stats,
          title,
          description,
          aiCue,
          // Stamp the live location on the content so the switcher badge + the
          // no-op guard read it back from here (not the static prop).
          executionLocation: newLocation,
        };
        onGeneratedWorkoutUpdate?.(updated);
        const result = { swappedMethod, swappedExercise, keptMarked };
        setLastResult(result);
        console.log(
          `[swapAll] ${dimension}→${value}: ${swappedMethod} method-swap, ${swappedExercise} exercise-swap, ${keptMarked} kept+marked`,
        );
      } catch (err) {
        console.error('[swapAll] failed:', err);
      } finally {
        setIsSwapping(false);
      }
    },
    [generatedWorkout, onGeneratedWorkoutUpdate, userProfile, currentLocation, exercisePool],
  );

  return { swapAll, isSwapping, lastResult };
}
