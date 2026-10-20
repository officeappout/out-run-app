/**
 * "What next?" — the one recommendation after a workout (and the order of the cards
 * under the done-today summary), from today's plan and the week's goals
 * (enable_home_v2, owner 20.10.2026). PURE.
 *
 * Owner's order:
 *   1. something still planned for today (not done) → that, in the plan's order;
 *   2. steps still missing → a short walk;
 *   3. strength sessions still due this week (and no strength done today) → strength;
 *   4. runs still due this week (and no run done today) → a run;
 *   5. everything reached → rest / recovery.
 * The same kind the user just did is never recommended again the same day (2× strength
 * on one day is not a recommendation — see audit-carousel.md, question Q3).
 */
import type { PlanKind } from './day-plan';

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
}

export interface NextRecommendation {
  kind: NextKind;
  /** Why — 'planned' (still on today's plan) / 'steps' / 'week' (weekly goal) / 'done'. */
  why: 'planned' | 'steps' | 'week' | 'done';
}

/** Below this, a "short walk" isn't worth a card (stepGapWalk uses the same floor idea). */
export const MIN_STEPS_GAP = 500;

export function resolveNextRecommendation(input: NextRecommendationInput): NextRecommendation {
  const { doneToday, plannedToday, stepsRemaining, hasStrengthProgram, hasRunningPlan, week } = input;
  const done = new Set(doneToday);

  const pending = plannedToday.find((k) => k !== 'group' && !done.has(k));
  if (pending && pending !== 'group') return { kind: pending, why: 'planned' };

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
      return next.why === 'planned' ? 'עוד מחכה לך היום: אימון כוח' : 'נשאר אימון כוח השבוע';
    case 'run':
      return next.why === 'planned' ? 'עוד מחכה לך היום: ריצה' : 'נשארה ריצה השבוע';
    default:
      return 'סיימת הכל, מגיע לך מנוחה';
  }
}

/** Kinds done today from today's workout docs (hybrid = walk/run + strength). */
export function doneKindsOf(
  workouts: ReadonlyArray<{ workoutType?: string | null; activityType?: string | null }> | null | undefined,
): PlanKind[] {
  const out = new Set<PlanKind>();
  for (const w of workouts ?? []) {
    const t = w.workoutType || w.activityType || '';
    if (t === 'walking') out.add('walk');
    else if (t === 'running') out.add('run');
    else if (t === 'strength' || t === 'workout') out.add('strength');
    else if (t === 'hybrid') {
      out.add('strength');
      out.add(w.activityType === 'running' ? 'run' : 'walk');
    }
  }
  return Array.from(out);
}
