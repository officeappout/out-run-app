import type { RunningScheduleSource } from '@/lib/running-schedule-source';
import type { ActiveRunningProgram } from '../types/running.types';

/**
 * Day-count-change decision + history-preserving merge for running
 * schedules — two functions, both pure (no Firestore), no actual
 * `schedule[]` REBUILD (that's `buildRunningPlan`'s job,
 * `plan-generator.service.ts`). Updated 01.09.2026 when
 * `mergePreservedHistory` joined this file: the line below claiming "no
 * actual schedule[] rebuild" described `resolveRunningScheduleChange`
 * alone and was accurate for it — but by the time `mergePreservedHistory`
 * (bottom of this file) was added alongside it, the file AS A WHOLE did
 * start touching `schedule[]` (merging two arrays, not rebuilding one),
 * making the blanket claim stale. Fixed here rather than left for someone
 * to trust literally.
 *
 * `resolveRunningScheduleChange`: the three day-change rules (David,
 * locked, idempotent-booping-sunrise.md Round 3 §2): (1) system-default →
 * user's first real choice = completely
 * smooth, no warning. (2) same day-count, different days = silent remap,
 * week preserved. (3) day-count changes = rebuild, week still preserved,
 * with an explanatory sentence owed to the user. Always: never block,
 * never reset to week 1.
 *
 * Rule 1 takes priority over 2/3 regardless of day-count — it's not "same
 * count vs different count," it's "is this the first real choice at all."
 * A system-default user going from 3 days to 3 *different* days is still
 * rule 1 (smooth), not rule 2, because they never made a real choice to
 * remap *from*. `oldSource` (from `resolveRunningScheduleSource` — the
 * already-decided null→'system-default' interpretation, not the raw
 * `getRunningScheduleSource`) is what rule 1 keys off, not day-count
 * equality.
 *
 * `first-time` describes the CHOICE's origin, not the USER's tenure. A
 * runner who's been training for 8 weeks but predates `scheduleDaysSource`
 * (the field didn't exist yet) resolves to `oldSource: 'system-default'`
 * via 1a's decision — and still gets `first-time` here. That is
 * deliberate, not a gap: "never reset to week 1" is unconditional across
 * all three kinds (David, 31.08.2026) — `preservedWeek` below is computed
 * once, before `kind` is even decided, and never reads `kind`. An
 * 8-week-veteran's `first-time` change still carries week 8 forward.
 *
 * Pure decision only — no Firestore, no `schedule[]` REBUILD (that stays
 * `buildRunningPlan`'s job). This function only decides what kind of
 * change happened and what week number to carry forward; the caller
 * applies whatever wording/rebuild logic go with it — including calling
 * `mergePreservedHistory` below with this function's own `preservedWeek`
 * output.
 * `explanationHe` copy itself is a UI-layer decision (deliberately not
 * hardcoded here), following the plan's own §6 pattern of proposing user-
 * facing copy separately rather than baking it into infrastructure.
 *
 * Deviates from the plan's originally-sketched signature
 * `(oldScheduleDays, newScheduleDays, existingSchedule[], startDate)`:
 * `existingSchedule[]`/`startDate` are dropped because this function makes
 * a decision, it doesn't transform data — the actual `schedule[]` rebuild
 * and `startDate` preservation belong to the writer that acts on this
 * decision (Block 3's `changeRunningScheduleDays`), which needs the real
 * document, not a decision object. Flagged here rather than silently
 * changed, per this round's own rule about contradicting a stated plan.
 */
export type RunningScheduleChangeKind = 'first-time' | 'remap' | 'rebuild';

export interface RunningScheduleChangeDecision {
  kind: RunningScheduleChangeKind;
  /** Never < 1, never silently reset — always the input week, clamped only against invalid input. */
  preservedWeek: number;
  /** True only for 'rebuild' — the one kind the three rules say owes the user a sentence. */
  requiresExplanation: boolean;
}

export interface ResolveRunningScheduleChangeInput {
  oldSource: RunningScheduleSource;
  oldScheduleDays: readonly string[];
  newScheduleDays: readonly string[];
  currentWeek: number;
}

export function resolveRunningScheduleChange(
  input: ResolveRunningScheduleChangeInput,
): RunningScheduleChangeDecision {
  const kind: RunningScheduleChangeKind =
    input.oldSource === 'system-default'
      ? 'first-time'
      : input.newScheduleDays.length === input.oldScheduleDays.length
        ? 'remap'
        : 'rebuild';

  const preservedWeek =
    Number.isFinite(input.currentWeek) && input.currentWeek >= 1
      ? Math.trunc(input.currentWeek)
      : 1;

  return {
    kind,
    preservedWeek,
    requiresExplanation: kind === 'rebuild',
  };
}

/**
 * Companion to `resolveRunningScheduleChange` above, deliberately a
 * SEPARATE function, not folded into `buildRunningPlan`
 * (`plan-generator.service.ts`) (David, 01.09.2026 review): each function
 * does one thing, both stay pure and independently testable — the same
 * split already used elsewhere in this repo (`mergeDayItems`,
 * `flattenPlanToSchedule`). The planned "adaptive running plan / smart
 * coach" feature (documented, not built) will want this exact merge on
 * its own, without a full rebuild — e.g. stamping real completion data
 * onto an existing schedule — so keeping it standalone makes it usable
 * there immediately instead of needing to be extracted out of a
 * rebuild-specific function later.
 *
 * Rule: entries whose `week < preservedWeek` are carried forward from
 * `oldSchedule` byte-for-byte (including `status`/`actualPerformance` —
 * this is what actually protects a user's completed-run history from a
 * rebuild's fresh `schedule[]`, which `buildRunningPlan` has no way to
 * know about on its own). Entries whose `week >= preservedWeek` come from
 * `newSchedule`. No week is invented for either side — if `oldSchedule`
 * has no entries below `preservedWeek` (e.g. `preservedWeek === 1`,
 * first-time choice — nothing to preserve) or `newSchedule` has none at
 * or above it, the result simply reflects whatever each side actually
 * has.
 */
export function mergePreservedHistory(
  oldSchedule: ActiveRunningProgram['schedule'],
  newSchedule: ActiveRunningProgram['schedule'],
  preservedWeek: number,
): ActiveRunningProgram['schedule'] {
  return [
    ...oldSchedule.filter((entry) => entry.week < preservedWeek),
    ...newSchedule.filter((entry) => entry.week >= preservedWeek),
  ];
}
