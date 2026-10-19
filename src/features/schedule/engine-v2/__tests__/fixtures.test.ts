/**
 * The 33 scenarios of agent-briefs/schedule-combos.fixtures.json (copied next to this file).
 *
 * Layout scenarios run through buildWeek. Makeup / return scenarios (S13, S14, S15, S30)
 * run through planMakeup / planReturn in makeup.test.ts. S29 (race week) is out of scope
 * for this PR (owner: race date later) and is listed as a todo.
 *
 * Where the doc's expected answer is one of several equally valid weeks (`exact: false`),
 * the engine's own choice is pinned in ENGINE_CHOICE below, so a change in the engine's
 * choice is a visible, reviewed diff — not silent drift.
 */
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/schedule-combos.fixtures.json';
import { buildWeek } from '../buildWeek';
import {
  constraintFailures,
  describe7,
  layoutDiffs,
  layoutOf,
  mustHoldFailures,
  REASON_ALIASES,
  reasonCodes,
  toEngineInput,
  type Fixture,
} from './fixtureHarness';
import { ENGINE_CHOICE, WAIVED_CONSTRAINTS } from './engineChoices';
import type { WeekPlan } from '../types';

function compact(plan: WeekPlan): string {
  return plan.days
    .map((d) =>
      d.sessions
        .filter((s) => !s.optional && (s.kind === 'run' || s.kind === 'strength'))
        .map((s) => (s.kind === 'run' ? s.slot : `${s.slug}${s.volumePct ? `@${s.volumePct}` : ''}`))
        .join('+') || '-',
    )
    .join(' | ');
}

const NOT_LAYOUT = new Set(['S13', 'S14', 'S15', 'S30']);
const OUT_OF_SCOPE = new Set(['S29']);

const scenarios: Fixture[] = (fixtures as Fixture).scenarios;

describe('schedule engine v2 — fixtures (layout scenarios)', () => {
  it('has all 33 scenarios', () => {
    expect(scenarios).toHaveLength(33);
  });

  for (const f of scenarios) {
    if (NOT_LAYOUT.has(f.id)) continue;
    if (OUT_OF_SCOPE.has(f.id)) {
      it.todo(`${f.id} ${f.title} — race date is out of scope for this PR`);
      continue;
    }
    it(`${f.id} ${f.title}`, () => {
      const input = toEngineInput(f);
      const plan = buildWeek(input);
      const layout = layoutOf(plan);
      const exp = f.expected;
      const ctx = `\n${describe7(plan)}\npenalty ${plan.penalty} ${JSON.stringify(plan.penaltyBreakdown)}`;

      expect(plan.hardViolations, `hard violations${ctx}`).toEqual([]);
      if (exp.exact) expect(layoutDiffs(exp.layout, layout), `exact layout${ctx}`).toEqual([]);
      expect(mustHoldFailures(exp.mustHold ?? [], plan, input), `mustHold${ctx}`).toEqual([]);
      const waived = WAIVED_CONSTRAINTS[f.id] ?? [];
      const constraints = (exp.constraints ?? []).filter((_: unknown, i: number) => !waived.includes(i));
      expect(constraintFailures(constraints, layout), `constraints${ctx}`).toEqual([]);
      if (!exp.exact) expect(compact(plan), `pinned engine choice (${ENGINE_CHOICE[f.id]?.note})`).toBe(ENGINE_CHOICE[f.id]?.week);
      const codes = reasonCodes(plan);
      const missing = (exp.reasons ?? []).map((r: string) => REASON_ALIASES[r] ?? r).filter((r: string) => !codes.has(r));
      expect(missing, `reasons${ctx}\n${Array.from(codes).join(', ')}`).toEqual([]);
      for (const d of plan.days) expect(d.reasonsHe.length, `day ${d.dow} has a Hebrew reason`).toBeGreaterThan(0);
    });
  }
});
