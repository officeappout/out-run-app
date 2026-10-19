/**
 * Planned run → what it asks of a route (WorkoutRouteNeeds). Pure.
 *
 * HILL WORKOUTS — how they're modelled today: the template `category` is
 * one of hill_sprints / hill_short / hill_long (running.types WorkoutCategory),
 * and an effort block may carry `effortConfig.inclinePercent` (admin-authored,
 * optional). The rep length comes from the main rep (findMainRep): its
 * distance, or its time converted with the block's pace (estimateBlockMeters),
 * else at HILL_REP_FALLBACK_MPS. The grade comes from inclinePercent, else a
 * per-category default (HILL_DEFAULT_GRADE_PCT).
 */

import type { RunBlock } from '../../types/run-block.type';
import type { WorkoutCategory } from '../../../../core/types/running.types';
import { inferRunKind, resolveRunCategory } from '../../utils/run-preview/run-kind';
import {
  coreWorkBlocks,
  estimateBlockMeters,
  estimateRunTotals,
  findMainRep,
  type RunPaceContext,
} from '../../utils/run-preview/run-estimates';
import { isRunAfterDark } from './sun';
import type { HillRepSpec, WorkoutRouteNeeds } from './types';

export const HILL_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set<WorkoutCategory>(['hill_sprints', 'hill_short', 'hill_long']);

/** Grade a hill rep wants when the template doesn't say (inclinePercent absent). */
export const HILL_DEFAULT_GRADE_PCT: Record<'hill_sprints' | 'hill_short' | 'hill_long', number> = {
  hill_sprints: 6,
  hill_short: 4,
  hill_long: 3,
};
const HILL_GENERIC_GRADE_PCT = 4;

/** Uphill running speed used to turn a timed rep into metres when the pace is unknown (~4 m/s). */
export const HILL_REP_FALLBACK_MPS = 4;
/** Shortest climb worth looking for (a 10″ sprint is still ~50–60 m). */
export const HILL_MIN_REP_M = 60;

export interface WorkoutNeedsInput {
  blocks: readonly RunBlock[];
  category?: string | null;
  templateCategory?: string | null;
}

export interface WorkoutNeedsOptions {
  /** When the run starts (default: not checked → afterDark false). */
  startAt?: Date | null;
  /** Where — for the sunset check. */
  origin?: { lat: number; lng: number } | null;
}

function inclineOf(b: RunBlock): number | null {
  const v = b.effortConfig?.inclinePercent;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function buildHillSpec(
  blocks: readonly RunBlock[],
  category: WorkoutCategory | null,
  ctx: RunPaceContext,
): HillRepSpec | null {
  const inclined = coreWorkBlocks(blocks).filter((b) => inclineOf(b) != null);
  const isHillCategory = category != null && HILL_CATEGORIES.has(category);
  if (!isHillCategory && inclined.length === 0) return null;

  const main = inclined.length > 0 ? findMainRep(inclined) : findMainRep(blocks);
  const block = main?.block ?? null;
  let repLengthM = 0;
  if (block) {
    repLengthM = estimateBlockMeters(block, ctx) ?? 0;
    if (!repLengthM && block.durationSeconds) repLengthM = block.durationSeconds * HILL_REP_FALLBACK_MPS;
  }
  const minGradePct =
    (block && inclineOf(block)) ??
    (category && category in HILL_DEFAULT_GRADE_PCT
      ? HILL_DEFAULT_GRADE_PCT[category as keyof typeof HILL_DEFAULT_GRADE_PCT]
      : HILL_GENERIC_GRADE_PCT);
  return {
    repLengthM: Math.max(HILL_MIN_REP_M, Math.round(repLengthM)),
    minGradePct,
    reps: main?.count ?? 1,
  };
}

export function buildWorkoutRouteNeeds(
  input: WorkoutNeedsInput,
  ctx: RunPaceContext,
  opts: WorkoutNeedsOptions = {},
): WorkoutRouteNeeds {
  const category = resolveRunCategory(input.category, input.templateCategory);
  const kind = inferRunKind(category, input.blocks);
  const totals = estimateRunTotals(input.blocks, ctx);
  const targetKm = totals.meters && totals.meters > 0 ? Math.round(totals.meters / 100) / 10 : null;
  const durationMin = totals.seconds && totals.seconds > 0 ? Math.round(totals.seconds / 60) : null;
  const afterDark = !!(opts.startAt && opts.origin && isRunAfterDark(opts.startAt, durationMin, opts.origin));
  return {
    kind,
    category,
    targetKm,
    durationMin,
    hill: buildHillSpec(input.blocks, category, ctx),
    afterDark,
  };
}
