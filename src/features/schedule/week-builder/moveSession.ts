/**
 * Week builder — one move, end to end: layout (move / swap) → host normalize (e.g. the split's
 * day focus by position, or the engine re-placing runs on the new days) → engine-v2 hard rules
 * (validateLayout, the same predicates the search uses) → the engine's "why" per day.
 * A move is refused only for a violation it CREATES: a week the engine itself could only build
 * with a violation (nothing valid existed) stays editable. Pure.
 */
import { validateLayout } from '../engine-v2/validate';
import type { HardViolation } from '../engine-v2/rules';
import { dropReasonHe, type WbDropCode } from './dropReasons';
import { explainWeek } from './explain';
import { applyMove, openDaysOf, toPlacedDays } from './layout';
import type { WbMove, WbMoveResult, WbRules, WbWeek, WeekBuilderEngine } from './types';

export function weekViolations<P>(week: WbWeek<P>, rules: WbRules): HardViolation[] {
  return validateLayout(
    toPlacedDays(week),
    { open: openDaysOf(week), maxPerDay: rules.maxPerDay, maxTrainingDays: rules.maxTrainingDays },
    rules.runLevel,
  );
}

const violationKey = (v: HardViolation) => `${v.rule}:${[...v.days].sort((a, b) => a - b).join(',')}`;

/** The first violation `after` has that `before` didn't, as a drop code. */
export function newViolationCode(before: readonly HardViolation[], after: readonly HardViolation[]): WbDropCode | null {
  const seen = new Set(before.map(violationKey));
  const fresh = after.find((v) => !seen.has(violationKey(v)));
  if (!fresh) return null;
  if (fresh.rule === 'H1') return fresh.days.length === 0 ? 'too_many_days' : 'too_many_today';
  return fresh.rule;
}

export interface MoveOptions<P> {
  /** Host step after the layout move, before validation (focus by position, engine re-placement …). */
  normalize?: (week: WbWeek<P>) => WbWeek<P>;
  /** The "why" lines of the final week; default: the engine's reasons over the layout. */
  explain?: (week: WbWeek<P>) => WbWeek<P>;
}

const refuse = <P>(code: WbDropCode): WbMoveResult<P> => ({ ok: false, reasonHe: dropReasonHe(code) });

export function moveSession<P>(week: WbWeek<P>, move: WbMove, rules: WbRules, opts: MoveOptions<P> = {}): WbMoveResult<P> {
  const out = applyMove(week, move, rules.maxPerDay);
  if (out.kind === 'noop') return { ok: true, week, swappedWith: null };
  if (out.kind !== 'moved') return refuse(out.kind);
  // The drop as the user made it first (an invalid drop snaps back with its reason), then the
  // host's normalized week (what will really be saved) must hold too.
  const before = weekViolations(week, rules);
  const raw = newViolationCode(before, weekViolations(out.week, rules));
  if (raw) return refuse(raw);
  const next = opts.normalize ? opts.normalize(out.week) : out.week;
  if (next !== out.week) {
    const code = newViolationCode(before, weekViolations(next, rules));
    if (code) return refuse(code);
  }
  const explain = opts.explain ?? ((w: WbWeek<P>) => explainWeek(w, rules));
  return { ok: true, week: explain(next), swappedWith: out.swappedWith };
}

/** The default engine a host hands the builder. */
export function createWeekEngine<P>(rules: WbRules, opts: MoveOptions<P> = {}): WeekBuilderEngine<P> {
  return { move: (week, move) => moveSession(week, move, rules, opts), rules };
}
