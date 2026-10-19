'use client';

/**
 * The run overview's view model (enable_home_v2): the #462 preview model of
 * the workout AS IT WILL RUN (level / swapped main set / edited paces —
 * run-edits.ts), the level list, the swap candidates, and the axis legs
 * (free run, or on the chosen route with its walk there / back). Pure work happens in
 * utils/run-overview/*; this hook only wires the runner's pace profile.
 */

import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useRunningConfigStore } from '@/features/workout-engine/core/store/useRunningConfigStore';
import { computeZones } from '@/features/workout-engine/core/services/running-engine.service';
import type { RunnerProfileType } from '@/features/workout-engine/core/types/running.types';
import type { OverviewLeg } from '@/features/parks/core/components/overview/overview-legs';
import type RunWorkout from '../../types/run-workout.type';
import type { RunPaceContext } from '../../utils/run-preview/run-estimates';
import type { RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import { buildRunVariants, type RunVariant } from '../../utils/run-overview/run-variants';
import { applyRunEdits, type RunEdits } from '../../utils/run-overview/run-edits';
import { decodeMainSet, encodeMainSet, isUniform, mainSetTitle, readMainSet } from '../../utils/run-overview/run-main-set';
import { buildSwapAlternatives, type SwapGroup } from '../../utils/run-overview/run-swap-alternatives';
import { buildRunOverviewLegs } from '../../utils/run-overview/run-overview-legs';
import { useRunPreviewModel, type RunPreviewExtras } from '../preview-v2/useRunPreviewModel';

export interface RunPaceInfo {
  ctx: RunPaceContext;
  showPaceNumbers: boolean;
}

/** The runner's pace context (same sources as useRunPreviewModel). */
export function useRunPaceContext(): RunPaceInfo {
  const paceProfile = useUserStore((s) => s.profile?.running?.paceProfile);
  const config = useRunningConfigStore((s) => s.config);
  const basePace = paceProfile?.basePace ?? 0;
  const profileType: RunnerProfileType = paceProfile?.profileType ?? 3;
  return useMemo(() => {
    let zones: RunPaceContext['zones'] = null;
    try {
      zones = basePace > 0 ? computeZones(basePace, profileType, config) : null;
    } catch {
      zones = null;
    }
    return { ctx: { basePace, zones }, showPaceNumbers: profileType !== 3 };
  }, [basePace, profileType, config]);
}

export interface RunOverviewModel {
  model: RunPreviewModel;
  /** The workout as it will run (level / swap / paces applied). */
  active: RunWorkout;
  variants: RunVariant[] | null;
  legs: OverviewLeg[];
  pace: RunPaceInfo;
  /** "החלף מקטע" candidates (board M-7b); null = no main set to swap. */
  swapGroups: SwapGroup[] | null;
  /** The swap in effect ("היה 6 × 400 מ׳" → "4 × 600 מ׳"), or null. */
  swap: { from: string; to: string } | null;
}

export function useRunOverviewModel(
  workout: RunWorkout | null,
  edits: RunEdits,
  extras: RunPreviewExtras,
  walk: { thereMin: number; backMin: number } | null,
): RunOverviewModel | null {
  const pace = useRunPaceContext();
  const variants = useMemo(() => {
    if (!workout) return null;
    try {
      return buildRunVariants(workout.blocks, pace.ctx);
    } catch {
      return null;
    }
  }, [workout, pace.ctx]);
  const active = useMemo<RunWorkout | null>(() => {
    if (!workout) return null;
    try {
      return applyRunEdits(workout, edits, pace.ctx);
    } catch {
      return workout;
    }
  }, [workout, edits, pace.ctx]);
  const swapGroups = useMemo(() => {
    if (!workout || !active) return null;
    try {
      // Candidates around the PLANNED set; the one running now is marked.
      const now = edits.swap ?? (() => {
        const cur = readMainSet(active.blocks);
        return cur ? encodeMainSet(cur.spec) : null;
      })();
      return buildSwapAlternatives(readMainSet(workout.blocks), pace.ctx, { category: workout.category, selectedKey: now });
    } catch {
      return null;
    }
  }, [workout, active, edits.swap, pace.ctx]);
  const model = useRunPreviewModel(active, extras);
  const swap = active?.mainSwap ?? null;
  const legs = useMemo(() => {
    if (!active || !model) return [];
    try {
      const spec = decodeMainSet(edits.swap);
      const collapseMain = spec && !isUniform(spec) ? { stripLabel: mainSetTitle(spec) } : null;
      return buildRunOverviewLegs(active.blocks, pace.ctx, { kind: model.kind, showPaceNumbers: pace.showPaceNumbers, walk, collapseMain });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, model, pace, walk?.thereMin, walk?.backMin, edits.swap]);
  if (!active || !model) return null;
  return { model, active, variants, legs, pace, swapGroups, swap };
}
