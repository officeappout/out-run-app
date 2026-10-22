/**
 * Run rules for moving runs inside the current week (enable_week_builder_v1, owner 22.10) — on
 * top of the engine-v2 hard rules every move already passes (H2 no strength on the long-run day,
 * H3 no heavy legs before a key run, H4 quality runs ≥48h apart, H8 run streak cap):
 *
 *   R1  one run per day;
 *   R2  no two HARD runs (quality or long) on consecutive days — at least one easy / rest day
 *       between them, so the long run stays protected too.
 *
 * Like the engine, a move is refused only for a violation it CREATES. Pure.
 */
import { isKeySlot } from '../../engine-v2/config';
import { countsInLoad } from '../layout';
import { moveSession, type MoveOptions } from '../moveSession';
import type { WbMove, WbMoveResult, WbRules, WbWeek, WeekBuilderEngine } from '../types';

export type RunRuleCode = 'R1' | 'R2';

export const RUN_RULE_REASON_HE: Record<RunRuleCode, string> = {
  R1: 'ריצה אחת ביום',
  R2: 'בין שתי ריצות קשות צריך יום קל או מנוחה',
};

export function runRuleViolations<P>(week: WbWeek<P>): string[] {
  const out: string[] = [];
  const runs = week.days.map((d) => d.sessions.filter((s) => s.track === 'run' && countsInLoad(d, s)));
  runs.forEach((r, dow) => {
    if (r.length > 1) out.push(`R1:${dow}`);
  });
  const hard = runs.map((r) => r.some((s) => isKeySlot(s.slot)));
  for (let d = 0; d < 6; d++) if (hard[d] && hard[d + 1]) out.push(`R2:${d}`);
  return out;
}

/** The first run-rule violation `after` has that `before` didn't. */
export function newRunRuleCode<P>(before: WbWeek<P>, after: WbWeek<P>): RunRuleCode | null {
  const seen = new Set(runRuleViolations(before));
  const fresh = runRuleViolations(after).find((v) => !seen.has(v));
  return fresh ? (fresh.slice(0, 2) as RunRuleCode) : null;
}

/** moveSession + the run rules above (the planner's one move). */
export function movePlannerSession<P>(week: WbWeek<P>, move: WbMove, rules: WbRules, opts: MoveOptions<P> = {}): WbMoveResult<P> {
  const r = moveSession(week, move, rules, opts);
  if (!r.ok || r.week === week) return r;
  const code = newRunRuleCode(week, r.week);
  return code ? { ok: false, reasonHe: RUN_RULE_REASON_HE[code] } : r;
}

export function createPlannerEngine<P>(rules: WbRules, opts: MoveOptions<P> = {}): WeekBuilderEngine<P> {
  return { move: (week, move) => movePlannerSession(week, move, rules, opts) };
}
