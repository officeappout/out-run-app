/**
 * "What next?" — the one recommendation after a workout (and the order of the cards
 * under the done-today summary), from today's plan and the week's goals
 * (enable_home_v2, owner 20.10.2026). PURE.
 *
 * Owner's order:
 *   1. something still planned for today (not done) → that, in the plan's order;
 *   1b. strength done today but only part of the daily set goal → "אימון משלים"
 *       (strength-top-up.ts — the one exception to "never the same kind twice");
 *   2. steps still missing → a short walk;
 *   3. strength sessions still due this week (and no strength done today) → strength;
 *   4. runs still due this week (and no run done today) → a run;
 *   5. everything reached → rest / recovery.
 * The same kind the user just did is never recommended again the same day (2× strength
 * on one day is not a recommendation — see audit-carousel.md, question Q3).
 */
import type { PlanKind } from './day-plan';
import { doneKindsOfDoc } from '@/features/workout-engine/hybrid/hybrid-counting';

export type NextKind = 'walk' | 'run' | 'strength' | 'rest';

export interface WeekGoals {
  strengthDone: number;
  strengthTarget: number;
  runDone: number;
  runTarget: number;
}

export interface NextRecommendationInput {
  /** Kinds completed today (from today's workout docs). */
  doneToday: readonly PlanKind[];
  /** Today's planned kinds, in plan order (day-plan.ts), done or not. */
  plannedToday: readonly PlanKind[];
  /** Steps still missing today; null = unknown (no health data). */
  stepsRemaining: number | null;
  hasStrengthProgram: boolean;
  hasRunningPlan: boolean;
  week: WeekGoals | null;
  /** Sets still missing from today's strength goal (strength-top-up.ts); 0 / absent = none. */
  strengthTopUpSets?: number;
}

export interface NextRecommendation {
  kind: NextKind;
  /** Why — 'planned' (still on today's plan) / 'steps' / 'week' (weekly goal) / 'done'. */
  why: 'planned' | 'topup' | 'steps' | 'week' | 'done';
  /** why 'topup' only: the sets still missing today. */
  sets?: number;
}

/** Below this, a "short walk" isn't worth a card (stepGapWalk uses the same floor idea). */
export const MIN_STEPS_GAP = 500;

export function resolveNextRecommendation(input: NextRecommendationInput): NextRecommendation {
  const { doneToday, plannedToday, stepsRemaining, hasStrengthProgram, hasRunningPlan, week, strengthTopUpSets = 0 } = input;
  const done = new Set(doneToday);

  const pending = plannedToday.find((k) => k !== 'group' && !done.has(k));
  if (pending && pending !== 'group') return { kind: pending, why: 'planned' };

  if (done.has('strength') && strengthTopUpSets > 0) return { kind: 'strength', why: 'topup', sets: strengthTopUpSets };

  if (stepsRemaining != null && stepsRemaining >= MIN_STEPS_GAP) return { kind: 'walk', why: 'steps' };

  if (hasStrengthProgram && !done.has('strength') && week && week.strengthDone < week.strengthTarget) {
    return { kind: 'strength', why: 'week' };
  }
  if (hasRunningPlan && !done.has('run') && week && week.runDone < week.runTarget) {
    return { kind: 'run', why: 'week' };
  }
  return { kind: 'rest', why: 'done' };
}

/** The kind of a ranked engine suggestion (post_workout / home surfaces). */
export function suggestionKindOf(s: { generatorId: string; goalTags?: readonly string[] }): NextKind {
  switch (s.generatorId) {
    case 'recovery-follow-up':
      return 'rest';
    case 'safety-net':
      return 'walk';
    case 'full-strength':
    case 'complementary-short':
    case 'partial-completion':
      return 'strength';
    default:
      break;
  }
  const tags = s.goalTags ?? [];
  if (tags.includes('run')) return 'run';
  if (tags.includes('walk')) return 'walk';
  if (tags.includes('strength') || tags.includes('core')) return 'strength';
  return 'rest';
}

/** Stable: the items of the recommended kind first, the rest in their ranked order. */
export function orderByNext<T>(items: readonly T[], kindOf: (t: T) => NextKind, next: NextKind): T[] {
  const lead = items.filter((t) => kindOf(t) === next);
  if (!lead.length) return [...items];
  return [...lead, ...items.filter((t) => kindOf(t) !== next)];
}

/**
 * The walker duplicate (owner-approved): when the short "complete your steps" walk card is
 * on screen, the engine's generic steps card (safety-net) says the same thing — drop it.
 */
export function dropStepsDuplicate<T extends { generatorId: string }>(items: readonly T[], shortWalkShown: boolean): T[] {
  return shortWalkShown ? items.filter((s) => s.generatorId !== 'safety-net') : [...items];
}

/** The header above the cards after a workout. */
export function nextHeaderHe(next: NextRecommendation): string {
  switch (next.kind) {
    case 'walk':
      return next.why === 'planned' ? 'עוד מחכה לך היום: הליכה' : 'נשארו צעדים — הליכה קצרה תסגור את היום';
    case 'strength':
      if (next.why === 'topup') return 'אימון משלים — לסגור את יעד הכוח של היום';
      return next.why === 'planned' ? 'עוד מחכה לך היום: אימון כוח' : 'נשאר אימון כוח השבוע';
    case 'run':
      return next.why === 'planned' ? 'עוד מחכה לך היום: ריצה' : 'נשארה ריצה השבוע';
    default:
      return 'סיימת הכל, מגיע לך מנוחה';
  }
}

/**
 * "הריצה הבאה" after a workout (owner-approved, audit ש5): a run is still due this week, none
 * was done today, and the plan's next run is on another day (home-run-slot kind 'next').
 */
export function nextRunCardDue(input: {
  hasRunningPlan: boolean;
  doneToday: readonly PlanKind[];
  week: Pick<WeekGoals, 'runDone' | 'runTarget'> | null;
  runSlotKind: 'today' | 'next' | null | undefined;
}): boolean {
  const { hasRunningPlan, doneToday, week, runSlotKind } = input;
  return hasRunningPlan && runSlotKind === 'next' && !doneToday.includes('run') && !!week && week.runDone < week.runTarget;
}

/** Puts the next-run card first when the run is the recommendation, otherwise last. */
export function placeNextRunCard<T>(items: readonly T[], card: T, next: NextRecommendation | null): T[] {
  return next?.kind === 'run' ? [card, ...items] : [...items, card];
}

/**
 * Kinds done today from today's workout docs. A combined workout counts per part
 * (owner, 20.10.2026): its running legs → run, walking legs → walk, stations → strength.
 */
export function doneKindsOf(
  workouts: ReadonlyArray<{ workoutType?: string | null; activityType?: string | null; segments?: unknown }> | null | undefined,
): PlanKind[] {
  const out = new Set<PlanKind>();
  for (const w of workouts ?? []) {
    for (const k of doneKindsOfDoc(w)) out.add(k);
  }
  return Array.from(out);
}
