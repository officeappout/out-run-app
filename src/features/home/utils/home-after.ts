/**
 * Home after a workout (enable_home_after_v1, owner-approved canvas option B, 30.10.2026).
 *
 * Everything for today lives in ONE carousel under the week strip: what is still left today
 * first (the top-up strength card, today's planned walk / run, then the engine's other cards), and the
 * "done today" slide last. No encouragement banner, no separate done card above the strip and
 * no separate run card. Pure: the page passes what it already resolved.
 */

export const HOME_AFTER_DONE_ID = 'home-after-done';

export interface HomeAfterGateInput {
  flag: boolean;
  v2: boolean;
  isToday: boolean;
  /** Today's workout is done (postWorkoutDone || todayWorkoutDone). */
  workoutDone: boolean;
}

/** The after-workout layout applies: flag + home v2, today, and today's workout is done. */
export function isHomeAfterActive(i: HomeAfterGateInput): boolean {
  return i.flag && i.v2 && i.isToday && i.workoutDone;
}

/** Today's run still belongs in the carousel: a run planned for today, not skipped (a too-short run counts as still due). */
export function runTodayStillDue(slot: { kind: 'today' | 'next'; skippedToday?: boolean } | null | undefined): boolean {
  return !!slot && slot.kind === 'today' && !slot.skippedToday;
}

export interface ComposeHomeAfterInput<T> {
  /** The engine's ranked after-workout cards (already ordered by the next recommendation). */
  remaining: readonly T[];
  /** Today's planned slides still due (today's walk, today's run), after the top-up. */
  planned: readonly T[];
  /** Slides that go after the engine's cards (the short "close your steps" walk). */
  tail?: readonly T[];
  /** The top-up strength card (sets left to today's goal) leads, before the planned slides. */
  isTopUp: (t: T) => boolean;
  /** The "done today" slide, last. null when nothing is done (no slide). */
  done: T | null;
  /** Identity, so a slide already in the engine's list is never placed twice. */
  idOf: (t: T) => string;
}

/** Order: top-up, today's planned walk / run, the rest in their ranked order, the short walk, done. */
export function composeHomeAfterSlides<T>({ remaining, planned, tail = [], isTopUp, done, idOf }: ComposeHomeAfterInput<T>): T[] {
  const placed = new Set([...planned, ...tail].map(idOf));
  const rest = remaining.filter((t) => !placed.has(idOf(t)));
  const topUps = rest.filter(isTopUp);
  const others = rest.filter((t) => !isTopUp(t));
  return [...topUps, ...planned, ...others, ...tail, ...(done ? [done] : [])];
}
