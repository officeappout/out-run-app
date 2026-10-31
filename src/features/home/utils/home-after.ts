/**
 * Home after a workout (enable_home_after_v1, owner-approved canvas option B, 30.10.2026).
 *
 * Everything for today lives in ONE carousel under the week strip: what is still left today
 * first (the top-up strength card, today's planned walk / run, then the engine's other cards), and the
 * "done today" slide last; right after a workout (this app session, DONE_FIRST_MS) the done slide leads. No encouragement banner, no separate done card above the strip and
 * no separate run card. Pure: the page passes what it already resolved.
 */

export const HOME_AFTER_DONE_ID = 'home-after-done';

/** Stage 3: one "done" slide per finished workout (a post each), id `home-after-done:<card key>`. */
export const homeAfterDoneSlideId = (cardKey: string): string => `${HOME_AFTER_DONE_ID}:${cardKey}`;
export const isHomeAfterDoneSlideId = (id: string): boolean => id.startsWith(`${HOME_AFTER_DONE_ID}:`);

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
  /** The "done today" slides (one per finished workout), last. Empty when nothing is done. */
  done: readonly T[];
  /** Identity, so a slide already in the engine's list is never placed twice. */
  idOf: (t: T) => string;
  /** Right after a workout (this app session, a short window): the done slides lead (boards HomeAfterB / Short). */
  doneFirst?: boolean;
}

/**
 * Order: top-up, today's planned walk / run, the rest in their ranked order, the short walk, the done slides.
 * `doneFirst`: the done slides lead right after a workout, then fall back to last.
 */
export function composeHomeAfterSlides<T>({ remaining, planned, tail = [], isTopUp, done, idOf, doneFirst = false }: ComposeHomeAfterInput<T>): T[] {
  const placed = new Set([...planned, ...tail].map(idOf));
  const rest = remaining.filter((t) => !placed.has(idOf(t)));
  const topUps = rest.filter(isTopUp);
  const others = rest.filter((t) => !isTopUp(t));
  const left = [...topUps, ...planned, ...others, ...tail];
  return doneFirst ? [...done, ...left] : [...left, ...done];
}

/** How long the done slides lead after a workout before moving to the end (owner, 31.10.2026). */
export const DONE_FIRST_MS = 10 * 60 * 1000;

/** The done slides lead: a workout finished in this app session, less than DONE_FIRST_MS ago. */
export function isDoneFirst(completedAtIso: string | null | undefined, nowMs: number): boolean {
  if (!completedAtIso) return false;
  const t = new Date(completedAtIso).getTime();
  return Number.isFinite(t) && nowMs - t >= 0 && nowMs - t < DONE_FIRST_MS;
}
