/**
 * block-volume — how timed blocks count toward set volume (owner 30.10.2026,
 * training-audit PR 8a). Pure.
 *
 *   - EMOM: one minute = one set for that minute's exercise;
 *   - AMRAP: planned like EMOM (minutes ÷ members); completed = the rounds logged;
 *   - core tabata: a 4-minute block (8 × 20 s) = 4 sets, shared by its members — the same
 *     equivalent the weekly core target uses (owner 27.10.2026, core-weekly-target.ts);
 *   - conditioning moves (burpees) have no domain, so callers credit them nowhere.
 * The timed player logs one value per round / minute / interval, so a completed
 * EMOM / AMRAP already counts right; only tabata intervals need scaling.
 */
import { TABATA_CLASSIC } from './tabata.constants';
import { CORE_BLOCK_SET_EQUIVALENT } from './core-weekly-target';

export const TABATA_BLOCK_SETS = CORE_BLOCK_SET_EQUIVALENT;

type PlanExercise = { sets: number; protocolBlock?: 'tabata' | 'density'; densityBlockMinutes?: number };

/** Set equivalent of each planned exercise (same order). */
export function plannedSetEquivalents(exercises: readonly PlanExercise[]): number[] {
  const densityCount = exercises.filter((e) => e.protocolBlock === 'density').length;
  const tabataCount = exercises.filter((e) => e.protocolBlock === 'tabata').length;
  return exercises.map((e) => {
    if (e.protocolBlock === 'density' && e.densityBlockMinutes) return e.densityBlockMinutes / densityCount;
    if (e.protocolBlock === 'tabata') return TABATA_BLOCK_SETS / tabataCount;
    return e.sets;
  });
}

/** Total planned sets, blocks counted by their set equivalent (rounded to whole sets). */
export function plannedSetTotal(exercises: readonly PlanExercise[]): number {
  return Math.round(plannedSetEquivalents(exercises).reduce((a, n) => a + n, 0));
}

/** Sets credited for a completed exercise from its logged values (one per round / minute / interval). */
export function loggedSetEquivalent(loggedValues: number, segmentProtocol?: string, tabataRounds = TABATA_CLASSIC.rounds): number {
  if (segmentProtocol === 'tabata') return (loggedValues * TABATA_BLOCK_SETS) / Math.max(1, tabataRounds);
  return loggedValues;
}

type SegmentLike = { protocol?: string; protocolConfig?: unknown; exercises?: readonly unknown[] };

/**
 * Sets credited for one exercise of a finished workout's segment: the logged values
 * when there are any, else the plan (a timed block's minutes ÷ its members).
 */
export function completedSetsFor(segment: SegmentLike, plannedSets: number | undefined, loggedValues: number | undefined): number {
  const cfg = (segment.protocolConfig ?? {}) as { rounds?: number; totalIntervals?: number; capSec?: number };
  if (loggedValues != null) return loggedSetEquivalent(loggedValues, segment.protocol, cfg.rounds);
  const members = Math.max(1, segment.exercises?.length ?? 1);
  if (segment.protocol === 'tabata') return TABATA_BLOCK_SETS / members;
  if (segment.protocol === 'emom' && cfg.totalIntervals) return cfg.totalIntervals / members;
  if (segment.protocol === 'amrap' && cfg.capSec) return cfg.capSec / 60 / members;
  return plannedSets ?? 0;
}
