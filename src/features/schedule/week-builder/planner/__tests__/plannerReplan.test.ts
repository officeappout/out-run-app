/**
 * Planner week builder (enable_week_builder_v1, phase 2): the dated week, the missed-workout
 * re-plan and the save-scope mapping. Week of Sun 18.10.2026; today = Wed 21.10.
 */
import { describe, expect, it } from 'vitest';
import type { AdvisorProfile } from '../../../advisor/types';
import { dropReasonHe } from '../../dropReasons';
import { moveSession } from '../../moveSession';
import { buildPlannerWeek, settleStatus, type PlannerWeekInput } from '../plannerWeek';
import { planPlannerSave, plannerMoves } from '../plannerSave.plan';
import { replanMissed } from '../replanMissed';

const KEYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
const TODAY = '2026-10-21';
const isStrengthId = (id: string) => id === 'UPPER_BODY' || id === 'LOWER_BODY';

function input(template: Record<string, string[]>, extra: Partial<PlannerWeekInput> = {}): PlannerWeekInput {
  return {
    keys: KEYS,
    todayKey: TODAY,
    profile: { lifestyle: { recurringTemplate: template } } as unknown as AdvisorProfile,
    // Monday was hydrated (a real entry); the other template days have no doc yet.
    entriesByDate: {
      '2026-10-19': [{ entryId: 'e-mon', type: 'training', source: 'recurring', programIds: ['LOWER_BODY'], completed: false }],
    },
    // Sunday was trained, Monday was not.
    workouts: [{ date: '2026-10-18', kind: 'strength', minutes: 40 }],
    ...extra,
  };
}

const sessionOn = (w: ReturnType<typeof buildPlannerWeek>['week'], dow: number) => w.days[dow].sessions[0];

describe('buildPlannerWeek', () => {
  it('locks past days: done is locked, missed stays movable; today and later are open', () => {
    const m = buildPlannerWeek(input({ א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['UPPER_BODY'] }));
    expect(m.week.days.map((d) => !!d.past)).toEqual([true, true, true, false, false, false, false]);
    expect(m.week.days.map((d) => d.open)).toEqual([false, false, false, true, true, true, true]);
    expect(sessionOn(m.week, 0)).toMatchObject({ status: 'done', locked: true });
    expect(sessionOn(m.week, 1)).toMatchObject({ status: 'missed', locked: false, data: { entryIds: ['e-mon'], date: '2026-10-19' } });
    expect(sessionOn(m.week, 3)).toMatchObject({ status: undefined, locked: false, data: { entryIds: [], programIds: ['UPPER_BODY'] } });
    expect(m.missedCount).toBe(1);
  });

  it('never accepts a drop on a day that has passed', () => {
    const m = buildPlannerWeek(input({ א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['UPPER_BODY'] }));
    const r = moveSession(m.week, { sessionId: sessionOn(m.week, 3).id, toDow: 2 }, m.rules, { normalize: settleStatus });
    expect(r).toEqual({ ok: false, reasonHe: dropReasonHe('past') });
  });
});

describe('replanMissed', () => {
  it('puts a missed session on the earliest valid free day still ahead and clears its status', () => {
    const m = buildPlannerWeek(input({ א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['UPPER_BODY'] }));
    const r = replanMissed(m.week, m.rules);
    expect(r.dropped).toEqual([]);
    expect(r.placed).toEqual([{ sessionId: 'strength-2026-10-19', toDow: 4 }]);
    expect(r.week.days[1].sessions).toEqual([]);
    expect(sessionOn(r.week, 4)).toMatchObject({ id: 'strength-2026-10-19', status: undefined, homeDow: 1 });
  });

  it('drops what fits nowhere (48h between the same muscles) with a short reason, and keeps it on its day', () => {
    // Legs on Friday: Thursday and Saturday both sit next to it.
    const m = buildPlannerWeek(input({ א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['UPPER_BODY'], ו: ['LOWER_BODY'] }));
    const r = replanMissed(m.week, m.rules);
    expect(r.placed).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].reasonHe).toBe(dropReasonHe('H6'));
    expect(r.week.warningsHe[0]).toContain(r.dropped[0].reasonHe);
    expect(sessionOn(r.week, 1)).toMatchObject({ status: 'missed' });
  });
});

describe('save scope mapping', () => {
  const template = { א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['UPPER_BODY', 'run-tpl-1'] };
  const now = { recurringTemplate: template, scheduleDays: ['א', 'ב', 'ד'], isStrengthId };

  it('a re-planned missed session is a this-week date move only, even with "from now on"', () => {
    const m = buildPlannerWeek(input(template));
    const edited = replanMissed(m.week, m.rules).week;
    expect(plannerMoves(edited, KEYS, TODAY)).toEqual([
      { sessionId: 'strength-2026-10-19', kind: 'strength', fromDate: '2026-10-19', toDate: '2026-10-22', entryIds: ['e-mon'], programIds: ['LOWER_BODY'], fromPast: true },
    ]);
    expect(planPlannerSave(edited, KEYS, TODAY, 'forward', now).template).toBeNull();
  });

  it('"רק השבוע" writes date moves only; "מעכשיו והלאה" also moves the weekday in the template, keeping running ids', () => {
    const m = buildPlannerWeek(input(template));
    const r = moveSession(m.week, { sessionId: 'strength-2026-10-21', toDow: 5 }, m.rules, { normalize: settleStatus });
    expect(r.ok).toBe(true);
    const edited = r.ok ? r.week : m.week;

    const week = planPlannerSave(edited, KEYS, TODAY, 'week', now);
    expect(week.moves).toEqual([
      { sessionId: 'strength-2026-10-21', kind: 'strength', fromDate: '2026-10-21', toDate: '2026-10-23', entryIds: [], programIds: ['UPPER_BODY'], fromPast: false },
    ]);
    expect(week.template).toBeNull();

    const forward = planPlannerSave(edited, KEYS, TODAY, 'forward', now);
    expect(forward.moves).toEqual(week.moves);
    expect(forward.template).toEqual({
      recurringTemplate: { א: ['UPPER_BODY'], ב: ['LOWER_BODY'], ד: ['run-tpl-1'], ו: ['UPPER_BODY'] },
      scheduleDays: ['א', 'ב', 'ו'],
    });
  });

  it('no change → nothing to write', () => {
    const m = buildPlannerWeek(input(template));
    expect(planPlannerSave(m.week, KEYS, TODAY, 'forward', now)).toEqual({ moves: [], template: null });
  });
});
