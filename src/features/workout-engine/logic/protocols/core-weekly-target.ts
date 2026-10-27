/**
 * Core as a weekly target (owner 27.10.2026, engine-combination-rules.md R31 + §2ג).
 *
 * Core is a muscle group with a weekly SET target (GlobalLevelConfig.weeklyTargetCore, admin
 * editable). It is filled through the one core slot at the end of each strength workout (the
 * existing 3 forms of core-block.ts: single 2-3 sets, or a 4-minute tabata / follow-along by
 * remaining time). The slot is not mandatory every workout: once the week's target is met it is
 * skipped. The optional 8-minute core card on a non-workout day counts toward the same target.
 *
 * Pure. A caller passes the week's core sets so far; nothing here reads storage.
 */
import type { CoreBlockForm } from './core-block';

/**
 * How many core sets one block counts for. A single exercise counts its real sets; a 4-minute
 * tabata or follow-along counts like a 2-set single (TUNABLE, not an owner number yet).
 */
export const CORE_BLOCK_SET_EQUIVALENT = 2;
/** Minutes of one core tabata / follow-along block (TABATA_BLOCK_SECONDS / 60). */
export const CORE_BLOCK_MINUTES = 4;
/** The optional short core card offered on non-workout days (owner 27.10: 8 minutes). */
export const OPTIONAL_CORE_CARD_MINUTES = 8;

export interface CoreWeeklyState {
  /** The week's core set target; null / 0 / missing = no target known (the slot stays open). */
  weeklyTarget?: number | null;
  /** Core sets already done this week (workouts + optional core cards). */
  setsThisWeek?: number | null;
}

/** True when the core slot should be filled in this workout. */
export function coreSlotOpen(state: CoreWeeklyState): boolean {
  const target = state.weeklyTarget ?? 0;
  if (!(target > 0)) return true;
  return (state.setsThisWeek ?? 0) < target;
}

/** Sets left to the weekly target (0 when met or when there is no target). */
export function coreSetsLeft(state: CoreWeeklyState): number {
  const target = state.weeklyTarget ?? 0;
  if (!(target > 0)) return 0;
  return Math.max(0, target - (state.setsThisWeek ?? 0));
}

/** Core sets one finished core slot counts for. */
export function coreSetsOfSlot(form: CoreBlockForm, singleSets = 0): number {
  return form === 'single' ? Math.max(0, Math.round(singleSets)) : CORE_BLOCK_SET_EQUIVALENT;
}

/** Core sets a finished optional core card counts for (a 4-minute block = one block equivalent). */
export function coreSetsOfOptionalCard(minutes: number = OPTIONAL_CORE_CARD_MINUTES): number {
  return Math.floor(Math.max(0, minutes) / CORE_BLOCK_MINUTES) * CORE_BLOCK_SET_EQUIVALENT;
}
