import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { WALK_PLAN_CONFIG } from '../walkPlan.config';
import {
  nextWeeklyMinutes,
  planTopUpDayWrites,
  planWalkTopUp,
  topUpDueToday,
  topUpReadDates,
  walkEntryMinutes,
} from '../walkTopUp';
import { walkEntryFor } from '../walkSchedule';
import { readStoredWalkingGoal, topUpCeilingMinutes, walkingGoalToStore } from '../walkingGoal';

// Tuesday 20.10.2026; its week starts Sunday 18.10.
const today = new Date(2026, 9, 20);

function walk(date: string, minutes: number, extra: Partial<UserScheduleEntry> = {}): UserScheduleEntry {
  const dow = new Date(`${date}T00:00:00`).getDay();
  return { ...walkEntryFor(date, { dow, minutes, target: { type: 'time', minutes }, isLong: false, estSteps: 0 }, 'morning' as never, 'u'), ...extra };
}

/** Walks on Sun/Tue/Thu of the weeks starting at the given Sundays. */
function weeks(sundays: string[], minutes = 30, extra: (d: string) => Partial<UserScheduleEntry> = () => ({})) {
  const byDate: Record<string, UserScheduleEntry[]> = {};
  for (const s of sundays) {
    for (const off of [0, 2, 4]) {
      const d = new Date(`${s}T00:00:00`);
      d.setDate(d.getDate() + off);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDate[iso] = [walk(iso, minutes, extra(iso))];
    }
  }
  return byDate;
}

describe('planWalkTopUp', () => {
  it('still ≥ 3 weeks ahead → nothing', () => {
    const byDate = weeks(['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']);
    expect(planWalkTopUp({ byDate, today, uid: 'u', stepGoal: null })).toBeNull();
  });

  it('< 3 weeks ahead → the week after the last saved week, same days and time of day', () => {
    const byDate = weeks(['2026-10-18', '2026-10-25']);
    const out = planWalkTopUp({ byDate, today, uid: 'u', stepGoal: null })!;
    expect(Object.keys(out).sort()).toEqual(['2026-11-01', '2026-11-03', '2026-11-05']);
    const e = out['2026-11-01'];
    expect(e.entryId).toBe('walkplan_2026-11-01');
    expect(e.startTime).toBe(byDate['2026-10-18'][0].startTime);
    expect(e.completed).toBe(false);
  });

  it('done walks → gentle growth (≤ 10%)', () => {
    const byDate = weeks(['2026-10-11', '2026-10-18', '2026-10-25'], 30, (d) => ({ completed: d < '2026-10-20' }));
    const out = planWalkTopUp({ byDate, today, uid: 'u', stepGoal: null })!;
    const total = Object.values(out).reduce((s, e) => s + walkEntryMinutes(e), 0);
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThanOrEqual(Math.round(90 * 1.1) + 5);
  });

  it('not this flow\'s walker → nothing', () => {
    expect(planWalkTopUp({ byDate: {}, today, uid: 'u', stepGoal: null })).toBeNull();
  });
});

describe('nextWeeklyMinutes', () => {
  it('done → +10% up to 150, then hold; missed → −10%; mixed → hold', () => {
    expect(nextWeeklyMinutes(100, 1, null)).toBe(110);
    expect(nextWeeklyMinutes(145, 1, null)).toBe(150);
    expect(nextWeeklyMinutes(200, 1, null)).toBe(200);
    expect(nextWeeklyMinutes(100, 0, null)).toBe(90);
    expect(nextWeeklyMinutes(60, 0, null)).toBe(WALK_PLAN_CONFIG.startMinutesByLevel.sedentary);
    expect(nextWeeklyMinutes(100, 0.5, null)).toBe(100);
  });
  it('no planned walk lately → the steps decide', () => {
    expect(nextWeeklyMinutes(100, null, 11000)).toBe(110);
    expect(nextWeeklyMinutes(100, null, 3000)).toBe(100);
  });
});

describe('planTopUpDayWrites', () => {
  it('only adds; a date with this flow\'s walk is never touched', () => {
    const strength = { entryId: 's', userId: 'u', date: '2026-11-01', programIds: ['x'], type: 'training', source: 'recurring', completed: false } as UserScheduleEntry;
    const existing = { '2026-11-01': [strength], '2026-11-03': [walk('2026-11-03', 30, { completed: true })] };
    const walks = { '2026-11-01': walk('2026-11-01', 30), '2026-11-03': walk('2026-11-03', 35) };
    const w = planTopUpDayWrites(existing, walks);
    expect(w).toHaveLength(1);
    expect(w[0].date).toBe('2026-11-01');
    expect(w[0].entries.map((e) => e.entryId)).toEqual(['s', 'walkplan_2026-11-01']);
  });
});

describe('guards', () => {
  it('read window: 6 weeks from last week\'s Sunday', () => {
    const d = topUpReadDates(today);
    expect(d).toHaveLength(42);
    expect(d[0]).toBe('2026-10-11');
  });
  it('once a day', () => {
    expect(topUpDueToday(null, today)).toBe(true);
    expect(topUpDueToday('2026-10-20', today)).toBe(false);
    expect(topUpDueToday('2026-10-19', today)).toBe(true);
  });
});

describe('stored walking goal (lifestyle.walkingGoal) — the top-up ceiling', () => {
  it('grows past 150 toward the stored target, same ±10% rule', () => {
    expect(nextWeeklyMinutes(150, 1, null, WALK_PLAN_CONFIG, 250)).toBe(165);
    expect(nextWeeklyMinutes(240, 1, null, WALK_PLAN_CONFIG, 250)).toBe(250);
    expect(nextWeeklyMinutes(250, 1, null, WALK_PLAN_CONFIG, 250)).toBe(250);
    expect(nextWeeklyMinutes(200, 0, null, WALK_PLAN_CONFIG, 250)).toBe(180);
    expect(nextWeeklyMinutes(200, null, 11000, WALK_PLAN_CONFIG, 250)).toBe(220);
  });
  it('missing / junk target → today\'s 150 ceiling; never above the WHO max', () => {
    expect(nextWeeklyMinutes(150, 1, null, WALK_PLAN_CONFIG, null)).toBe(150);
    expect(topUpCeilingMinutes(undefined)).toBe(150);
    expect(topUpCeilingMinutes(Number.NaN)).toBe(150);
    expect(topUpCeilingMinutes(100)).toBe(150);
    expect(topUpCeilingMinutes(999)).toBe(300);
  });
  it('planWalkTopUp passes the target through', () => {
    // 5 walks a week × 30′ = 150′ (3 walks can't pass 135′: one walk is ≤ 45′).
    const byDate: Record<string, UserScheduleEntry[]> = {};
    for (const s of ['2026-10-11', '2026-10-18', '2026-10-25']) {
      for (const off of [0, 1, 2, 3, 4]) {
        const d = new Date(`${s}T00:00:00`);
        d.setDate(d.getDate() + off);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDate[iso] = [walk(iso, 30, { completed: iso < '2026-10-20' })];
      }
    }
    const sum = (o: Record<string, UserScheduleEntry> | null) => Object.values(o ?? {}).reduce((s, e) => s + walkEntryMinutes(e), 0);
    const capped = sum(planWalkTopUp({ byDate, today, uid: 'u', stepGoal: null }));
    const grown = sum(planWalkTopUp({ byDate, today, uid: 'u', stepGoal: null, targetWeeklyMinutes: 250 }));
    expect(capped).toBeLessThanOrEqual(150);
    expect(grown).toBeGreaterThan(150);
    expect(grown).toBeLessThanOrEqual(165);
  });
  it('read / store helpers validate', () => {
    expect(readStoredWalkingGoal({ goal: 'weight_loss', targetWeeklyMinutes: 250 })).toEqual({ goal: 'weight_loss', targetWeeklyMinutes: 250 });
    expect(readStoredWalkingGoal({ goal: 'nope', targetWeeklyMinutes: 250 })).toBeNull();
    expect(readStoredWalkingGoal({ goal: 'health' })).toBeNull();
    expect(readStoredWalkingGoal(null)).toBeNull();
    expect(walkingGoalToStore('belly', { targetWeeklyMinutes: 200 })).toEqual({ goal: 'belly', targetWeeklyMinutes: 200 });
    expect(walkingGoalToStore('health', { targetWeeklyMinutes: 400 }).targetWeeklyMinutes).toBe(300);
  });
});
