import { describe, it, expect } from 'vitest';
import { strengthRuleFamily, runningRuleFamily, type RuleFamily } from '../ruleFamily';
import { buildDefaultTemplate } from '../scheduleRules';
import type { ScheduleDay, PrioritizedSkill, ProgramId, DayOfWeek } from '../../types/smartSchedule.types';
import type { RunningWeekDay, RunningDayRole } from '../runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

function emptyStrengthWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i as DayOfWeek,
    sessions: [],
    isRestDay: true,
    warnings: [],
  }));
}

const CATEGORY_FOR_ROLE: Record<RunningDayRole, WorkoutCategory> = {
  quality_primary: 'tempo',
  quality_secondary: 'short_intervals',
  long_run: 'long_run',
  easy_run: 'easy_run',
  recovery: 'easy_run',
};

function buildRunningWeek(roles: Array<RunningDayRole | null>): RunningWeekDay[] {
  if (roles.length !== 7) throw new Error('buildRunningWeek requires exactly 7 entries');
  return roles.map((role, dayOfWeek): RunningWeekDay => {
    if (role === null) return { dayOfWeek, category: null };
    return { dayOfWeek, category: CATEGORY_FOR_ROLE[role], role };
  });
}

const STRENGTH_SKILLS: PrioritizedSkill[] = [
  { id: 'PLANCHE', priority: 1, movementType: 'PUSH', isFreeSlot: false, minRestHours: 48, countsTowardCap: true },
];
const STRENGTH_PROGRAMS: ProgramId[] = [];

describe('RuleFamily contract parity — strength and running satisfy the exact same shape', () => {
  const families = [strengthRuleFamily, runningRuleFamily] as Array<RuleFamily<any, any, any>>;

  it('both adapters expose id + preferredDays(count) → number[]', () => {
    for (const family of families) {
      expect(typeof family.id).toBe('string');
      expect(family.id.length).toBeGreaterThan(0);
      const days = family.preferredDays(3);
      expect(Array.isArray(days)).toBe(true);
      days.forEach((d) => expect(typeof d).toBe('number'));
    }
  });

  it('both adapters return the exact same {valid, violations[]} shape from validate — including on a malformed (non-7-day) week', () => {
    const results = [
      strengthRuleFamily.validate(emptyStrengthWeek().slice(0, 5), {}),
      runningRuleFamily.validate(buildRunningWeek(Array(7).fill(null)).slice(0, 5) as RunningWeekDay[], { level: 'intermediate' }),
    ];
    for (const result of results) {
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      const v = result.violations[0];
      expect(typeof v.code).toBe('string');
      expect(['ERROR', 'WARN']).toContain(v.severity);
      expect(typeof v.message).toBe('string');
      expect(Array.isArray(v.affectedDays)).toBe(true);
    }
  });

  it('both adapters return {week, removed[], notes[]} from reduceTo', () => {
    const results = [
      strengthRuleFamily.reduceTo(emptyStrengthWeek(), 3, { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS }),
      runningRuleFamily.reduceTo(buildRunningWeek(Array(7).fill(null)), 0, { targetDistanceKm: 5 }),
    ];
    for (const result of results) {
      expect(result.week).toBeDefined();
      expect(Array.isArray(result.removed)).toBe(true);
      expect(Array.isArray(result.notes)).toBe(true);
    }
  });
});

describe('validate — a non-7-day week is always rejected (new wrapper guard, not present in either source file)', () => {
  it('strength adapter rejects a 5-day week', () => {
    const result = strengthRuleFamily.validate(emptyStrengthWeek().slice(0, 5), {});
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'STRENGTH-INVALID-WEEK')).toBe(true);
  });

  it('running adapter rejects a 5-day week', () => {
    const shortWeek = buildRunningWeek(Array(7).fill(null)).slice(0, 5) as RunningWeekDay[];
    const result = runningRuleFamily.validate(shortWeek, { level: 'intermediate' });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'RUN-INVALID-WEEK')).toBe(true);
  });
});

describe('reduceTo — same target as current count changes nothing', () => {
  it('strength: rebuilding at the same day count as the source week is a no-op diff', () => {
    const week = buildDefaultTemplate(STRENGTH_PROGRAMS, STRENGTH_SKILLS, 3);
    const result = strengthRuleFamily.reduceTo(week, 3, { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS });
    expect(result.removed).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('running: reduceTo(week, currentCount) leaves the week untouched', () => {
    const week = buildRunningWeek(['easy_run', null, 'quality_primary', null, null, null, null]);
    const result = runningRuleFamily.reduceTo(week, 2, { targetDistanceKm: 5 });
    expect(result.removed).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.week).toEqual(week);
  });
});

describe('reduceTo — running drops the least critical role, not the last day in the week', () => {
  it('FAIL-catching: an easy run on an early day is dropped before a long run on a later day, for a short-distance target', () => {
    // Short-distance drop order: easy_run < long_run < quality_secondary < quality_primary.
    // day 1 (easy) is chronologically EARLIER than day 5 (long) — a "drop the
    // last day in the array" bug would remove day 5 instead of day 1.
    const week = buildRunningWeek([null, 'easy_run', null, null, null, 'long_run', null]);
    const result = runningRuleFamily.reduceTo(week, 1, { targetDistanceKm: 3 });

    const day1 = result.week.find((d) => d.dayOfWeek === 1)!;
    const day5 = result.week.find((d) => d.dayOfWeek === 5)!;
    expect(day1.category).toBeNull(); // the easy run — least critical — is the one removed
    expect(day5.role).toBe('long_run'); // the long run survives despite being later in the week
    expect(result.removed.length).toBe(1);
    expect(result.notes[0]).toMatch(/קילומטראז/);
  });

  it('for a long-distance target, quality_secondary is dropped before the long run', () => {
    const week = buildRunningWeek(['quality_secondary', null, null, null, 'long_run', null, null]);
    const result = runningRuleFamily.reduceTo(week, 1, { targetDistanceKm: 15 });

    const day0 = result.week.find((d) => d.dayOfWeek === 0)!;
    const day4 = result.week.find((d) => d.dayOfWeek === 4)!;
    expect(day0.category).toBeNull();
    expect(day4.role).toBe('long_run');
  });
});

describe('placeOn — running: pure relabeling, order preserved', () => {
  it('relocates existing roles onto a new day-set, in the same order they occurred', () => {
    const week = buildRunningWeek(['long_run', null, 'easy_run', null, 'quality_primary', null, null]);
    const placed = runningRuleFamily.placeOn(week, [1, 3, 6], { targetDistanceKm: 10 });

    expect(placed).not.toBeNull();
    const byDay = Object.fromEntries(placed!.map((d) => [d.dayOfWeek, d.role]));
    expect(byDay[1]).toBe('long_run'); // 1st training in day-order → 1st new day
    expect(byDay[3]).toBe('easy_run'); // 2nd → 2nd
    expect(byDay[6]).toBe('quality_primary'); // 3rd → 3rd
    expect(byDay[0]).toBeUndefined(); // rest day — no role field at all, not null
    expect(byDay[2]).toBeUndefined();
    expect(byDay[4]).toBeUndefined();
    const byCategory = Object.fromEntries(placed!.map((d) => [d.dayOfWeek, d.category]));
    expect(byCategory[0]).toBeNull();
    expect(byCategory[2]).toBeNull();
    expect(byCategory[4]).toBeNull();
  });

  it('returns null when the requested day count does not match how many trainings exist', () => {
    const week = buildRunningWeek(['easy_run', null, 'long_run', null, null, null, null]); // 2 trainings
    expect(runningRuleFamily.placeOn(week, [1, 2, 3], { targetDistanceKm: 10 })).toBeNull();
  });

  it('returns null on duplicate or out-of-range day indices', () => {
    const week = buildRunningWeek(['easy_run', null, null, null, null, null, null]);
    expect(runningRuleFamily.placeOn(week, [1, 1], { targetDistanceKm: 10 })).toBeNull();
    expect(runningRuleFamily.placeOn(week, [7], { targetDistanceKm: 10 })).toBeNull();
  });
});

describe('placeOn — strength: only succeeds when the requested days match buildDefaultTemplate\'s own choice', () => {
  it('succeeds when the requested day-set is exactly what SCHEDULE_POLICY.PREFERRED_DAYS[3] would pick', () => {
    const week = strengthWeekOf(3);
    const placed = strengthRuleFamily.placeOn(week, [0, 2, 4], { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS });
    expect(placed).not.toBeNull();
  });

  it('fails when the requested day-set is a real 3-day set that buildDefaultTemplate would not have picked itself', () => {
    const week = strengthWeekOf(3);
    const placed = strengthRuleFamily.placeOn(week, [1, 3, 5], { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS });
    expect(placed).toBeNull();
  });
});

function strengthWeekOf(count: number): ScheduleDay[] {
  return buildDefaultTemplate(STRENGTH_PROGRAMS, STRENGTH_SKILLS, count);
}
