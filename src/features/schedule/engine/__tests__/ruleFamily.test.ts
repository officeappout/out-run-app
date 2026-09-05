import { describe, it, expect } from 'vitest';
import { strengthRuleFamily, runningRuleFamily, type RuleFamily } from '../ruleFamily';
import { buildDefaultTemplate } from '../scheduleRules';
import type { ScheduleDay, PrioritizedSkill, ProgramId, DayOfWeek } from '../../types/smartSchedule.types';
import type { RunningWeekDay, RunningDayRole } from '../runningRules';

function emptyStrengthWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i as DayOfWeek,
    sessions: [],
    isRestDay: true,
    warnings: [],
  }));
}

function buildRunningWeek(roles: Array<RunningDayRole | null>): RunningWeekDay[] {
  if (roles.length !== 7) throw new Error('buildRunningWeek requires exactly 7 entries');
  return roles.map((role, dayOfWeek) => ({ dayOfWeek, role }));
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
    expect(day1.role).toBeNull(); // the easy run — least critical — is the one removed
    expect(day5.role).toBe('long_run'); // the long run survives despite being later in the week
    expect(result.removed.length).toBe(1);
    expect(result.notes[0]).toMatch(/קילומטראז/);
  });

  it('for a long-distance target, quality_secondary is dropped before the long run', () => {
    const week = buildRunningWeek(['quality_secondary', null, null, null, 'long_run', null, null]);
    const result = runningRuleFamily.reduceTo(week, 1, { targetDistanceKm: 15 });

    const day0 = result.week.find((d) => d.dayOfWeek === 0)!;
    const day4 = result.week.find((d) => d.dayOfWeek === 4)!;
    expect(day0.role).toBeNull();
    expect(day4.role).toBe('long_run');
  });
});
