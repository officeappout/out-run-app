/**
 * Runs in the planner (enable_week_builder_v1, owner 22.10): movable inside the current week,
 * run rules, the per-date run move round trip, and nothing tagged / counted as missed.
 * Week of Sun 18.10.2026; today = Wed 21.10.
 */
import { describe, expect, it } from 'vitest';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import type { AdvisorProfile } from '../../../advisor/types';
import { runPlacementOf } from '../../../utils/runWeekByType';
import { planRunMoves } from '../../../utils/runWeekMoves';
import { buildPlannerWeek, settleStatus, type PlannerWbData, type PlannerWeekInput } from '../plannerWeek';
import { planPlannerSave, runDateMoves } from '../plannerSave.plan';
import { replanMissed } from '../replanMissed';
import { movePlannerSession, RUN_RULE_REASON_HE } from '../runMoveRules';
import type { WbMoveResult } from '../../types';

const KEYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
const TODAY = '2026-10-21';
const NEXT_KEYS = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RUNNING: any = {
  isUnlocked: true,
  scheduleDays: ['ב', 'ד', 'ו'],
  activeProgram: {
    startDate: '2026-10-18T00:00:00',
    schedule: [1, 2].flatMap((week) => [
      { week, day: 1, category: 'easy_run', slotType: 'easy_run', status: 'pending' },
      { week, day: 2, category: 'long_run', slotType: 'long_run', status: 'pending' },
      { week, day: 3, category: 'tempo', slotType: 'quality_primary', isQualityWorkout: true, status: 'pending' },
    ]),
  },
};

function input(running: object = RUNNING, keys = KEYS): PlannerWeekInput {
  return {
    keys,
    todayKey: TODAY,
    profile: { running, lifestyle: { recurringTemplate: {} } } as unknown as AdvisorProfile,
    entriesByDate: {},
    workouts: [],
    runsByType: true,
  };
}

const runDows = (w: ReturnType<typeof buildPlannerWeek>['week']) =>
  w.days.flatMap((d) => d.sessions.filter((s) => s.track === 'run').map((s) => ({ dow: d.dow, slot: s.slot, id: s.id, locked: !!s.locked, status: s.status })));

describe('planner runs', () => {
  it('current week: runs are movable (carry a run data kind); other weeks keep them locked', () => {
    const m = buildPlannerWeek(input());
    const runs = runDows(m.week);
    expect(runs).toHaveLength(3);
    expect(runs.filter((r) => r.dow >= 3).every((r) => !r.locked)).toBe(true);
    const next = buildPlannerWeek(input(RUNNING, NEXT_KEYS));
    expect(runDows(next.week).every((r) => r.locked)).toBe(true);
  });

  it('a run that did not happen counts only for the calm offer; the suggestion keeps the run rules', () => {
    const m = buildPlannerWeek(input());
    const monday = runDows(m.week).find((r) => r.dow === 1);
    expect(monday).toMatchObject({ slot: 'quality_primary', status: 'missed', locked: false });
    expect(m.missedCount).toBe(1);
    // Thu and Sat are free but both touch Friday's long run: the quality run fits nowhere.
    const r = replanMissed(m.week, m.rules);
    expect(r.placed).toEqual([]);
    expect(r.dropped).toEqual([{ sessionId: monday!.id, titleHe: expect.any(String), reasonHe: RUN_RULE_REASON_HE.R2 }]);
  });

  it('an easy run that did not happen moves to a free day still ahead', () => {
    const running = {
      ...RUNNING,
      activeProgram: { ...RUNNING.activeProgram, schedule: RUNNING.activeProgram.schedule.map((e: { slotType: string }) => (e.slotType === 'quality_primary' ? { ...e, category: 'easy_run', slotType: 'easy_run', isQualityWorkout: false } : e)) },
    };
    const m = buildPlannerWeek(input(running));
    const missed = runDows(m.week).find((x) => x.status === 'missed')!;
    const r = replanMissed(m.week, m.rules);
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0].sessionId).toBe(missed.id);
    expect(r.placed[0].toDow).toBeGreaterThanOrEqual(3);
  });

  it('refuses two hard runs on consecutive days (R2)', () => {
    const m = buildPlannerWeek(input());
    const runs = runDows(m.week);
    const hard = runs.filter((r) => r.slot === 'long_run' || r.slot === 'quality_primary');
    expect(hard).toHaveLength(2);
    const [a, b] = hard;
    const target = b.dow + 1 <= 6 && b.dow + 1 !== a.dow ? b.dow + 1 : b.dow - 1;
    const r = movePlannerSession(m.week, { sessionId: a.id, toDow: target }, m.rules, { normalize: settleStatus });
    expect(r.ok).toBe(false);
    if (!r.ok) expect([RUN_RULE_REASON_HE.R2, RUN_RULE_REASON_HE.R1]).toContain(r.reasonHe);
  });

  it('a run moved this week round-trips: save → runMoves → the planner and home show it on the new day', () => {
    const m = buildPlannerWeek(input());
    const easy = runDows(m.week).find((r) => r.slot === 'easy_run' && r.dow >= 3);
    // Move the first hard-free run that can go to Saturday or Thursday.
    const candidate = easy ?? runDows(m.week).find((r) => r.dow >= 3)!;
    let moved: WbMoveResult<PlannerWbData> | null = null;
    let toDow = -1;
    for (const d of [6, 4, 5, 3]) {
      if (d === candidate.dow) continue;
      const r = movePlannerSession<PlannerWbData>(m.week, { sessionId: candidate.id, toDow: d }, m.rules, { normalize: settleStatus });
      if (r.ok) {
        moved = r;
        toDow = d;
        break;
      }
    }
    expect(moved?.ok).toBe(true);
    if (!moved?.ok) return;
    const plan = planPlannerSave(moved.week, KEYS, TODAY, 'week', { recurringTemplate: {}, scheduleDays: [], isStrengthId: () => false });
    expect(plan.template).toBeNull();
    const stored = planRunMoves(undefined, runDateMoves(plan.moves));
    expect(stored).toHaveLength(1);

    const after = buildPlannerWeek(input({ ...RUNNING, runMoves: stored }));
    expect(runDows(after.week).find((r) => r.dow === toDow)?.slot).toBe(candidate.slot);
    expect(runDows(after.week).some((r) => r.dow === candidate.dow)).toBe(false);

    const running = { ...RUNNING, runMoves: stored };
    const day = (key: string) =>
      resolveRunningDayState(running.scheduleDays, running.activeProgram.schedule, 1, new Date(`${key}T09:00:00`), running.activeProgram.startDate, {
        byType: true,
        ...runPlacementOf(running),
      });
    expect(day(KEYS[toDow]).isRunDay).toBe(true);
    expect(day(KEYS[toDow]).todayEntry?.slotType).toBe(candidate.slot);
    expect(day(KEYS[candidate.dow]).isRunDay).toBe(false);
  });

  it('no runMoves field → home resolution is unchanged', () => {
    const plain = resolveRunningDayState(RUNNING.scheduleDays, RUNNING.activeProgram.schedule, 1, new Date('2026-10-21T09:00:00'), RUNNING.activeProgram.startDate, { byType: true, ...runPlacementOf(RUNNING) });
    const withEmpty = resolveRunningDayState(RUNNING.scheduleDays, RUNNING.activeProgram.schedule, 1, new Date('2026-10-21T09:00:00'), RUNNING.activeProgram.startDate, { byType: true, ...runPlacementOf({ ...RUNNING, runMoves: [] }) });
    expect(withEmpty).toEqual(plain);
  });
});
