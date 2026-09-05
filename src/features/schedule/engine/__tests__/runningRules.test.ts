import { describe, it, expect } from 'vitest';
import {
  preferredRunningDays,
  validateRunningWeek,
  runningCriticalityOrder,
  checkSingleSessionSpike,
  matchesSlotTypeForDrop,
  type RunningDayRole,
  type RunningWeekDay,
} from '../runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

const CATEGORY_FOR_ROLE: Record<RunningDayRole, WorkoutCategory> = {
  quality_primary: 'tempo',
  quality_secondary: 'short_intervals',
  long_run: 'long_run',
  easy_run: 'easy_run',
  recovery: 'easy_run', // 'recovery' isn't a WorkoutCategory value — slotType is what's authoritative here anyway.
};

/** Builds a week with an explicit slotType on every training day (slotType wins over the derived category). */
function buildWeek(slotTypes: Array<RunningDayRole | null>): RunningWeekDay[] {
  if (slotTypes.length !== 7) throw new Error('buildWeek requires exactly 7 entries');
  return slotTypes.map((slotType, dayOfWeek): RunningWeekDay => {
    if (slotType === null) return { dayOfWeek, category: null };
    return { dayOfWeek, category: CATEGORY_FOR_ROLE[slotType], slotType };
  });
}

/** Builds a week with NO slotType at all — category/isQualityWorkout only, exactly what every schedule entry written before 06.09.2026 looks like. */
function buildWeekWithoutSlotType(slotTypes: Array<RunningDayRole | null>): RunningWeekDay[] {
  if (slotTypes.length !== 7) throw new Error('buildWeekWithoutSlotType requires exactly 7 entries');
  return slotTypes.map((slotType, dayOfWeek): RunningWeekDay => {
    if (slotType === null) return { dayOfWeek, category: null };
    return { dayOfWeek, category: CATEGORY_FOR_ROLE[slotType] };
  });
}

describe('preferredRunningDays', () => {
  it('count=0 returns an empty set', () => {
    expect(preferredRunningDays(0)).toEqual([]);
  });

  it('count=7 returns every day', () => {
    expect(preferredRunningDays(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('count=4 spreads evenly across the whole week — not the old [1,2,4,5] two-adjacent-pairs shape', () => {
    const days = preferredRunningDays(4);
    expect(days).toEqual([0, 2, 4, 6]);
    // Explicitly the regression this function exists to fix.
    expect(days).not.toEqual([1, 2, 4, 5]);
  });

  it('count=5 keeps the longest run at 2, not front-loaded into a run of 3', () => {
    expect(preferredRunningDays(5)).toEqual([0, 1, 3, 4, 6]);
  });

  it('is deterministic for the same input', () => {
    const a = preferredRunningDays(3);
    const b = preferredRunningDays(3);
    expect(a).toEqual(b);
  });
});

describe('validateRunningWeek — RUN-01 (48h between quality workouts)', () => {
  it('PASS: quality workouts separated by a rest day satisfy the 48h minimum', () => {
    const week = buildWeek(['quality_primary', null, 'quality_secondary', null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    expect(result.violations.some((v) => v.code === 'RUN-01')).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('FAIL: two quality workouts on adjacent days violate the 48h minimum', () => {
    const week = buildWeek(['quality_primary', 'quality_secondary', null, null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    const violation = result.violations.find((v) => v.code === 'RUN-01');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('ERROR');
    expect(violation?.affectedDays).toEqual([0, 1]);
    expect(result.valid).toBe(false);
  });
});

describe('validateRunningWeek — RUN-02 (long run right after quality is a warning, not a block)', () => {
  it('PASS: the long run placed 2+ days after a quality workout has no warning', () => {
    const week = buildWeek(['quality_primary', null, 'long_run', null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    expect(result.violations.some((v) => v.code === 'RUN-02')).toBe(false);
  });

  it('FAIL: the long run immediately after a quality workout is flagged as WARN, but does not block validity', () => {
    const week = buildWeek(['quality_primary', 'long_run', null, null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    const violation = result.violations.find((v) => v.code === 'RUN-02');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('WARN');
    // A soft preference — RUN-01/RUN-04 unrelated, so the week is still valid.
    expect(result.valid).toBe(true);
  });
});

describe('validateRunningWeek — RUN-03 (easy run is a buffer, no violation mode of its own)', () => {
  it('PASS: an easy run right after a quality workout triggers nothing at all', () => {
    const week = buildWeek(['quality_primary', 'easy_run', null, null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    expect(result.violations).toEqual([]);
  });

  it('CONTRAST: replacing that same easy day with a second quality day (same position) does trigger RUN-01 — proving the buffer property belongs to the role, not the adjacency alone', () => {
    const week = buildWeek(['quality_primary', 'quality_secondary', null, null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'intermediate' });
    expect(result.violations.some((v) => v.code === 'RUN-01')).toBe(true);
  });
});

describe('validateRunningWeek — RUN-04 (max consecutive training days by level)', () => {
  it('PASS: a 2-day run for a beginner (cap 2) does not violate', () => {
    const week = buildWeek(['easy_run', 'easy_run', null, null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'beginner' });
    expect(result.violations.some((v) => v.code === 'RUN-04')).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('FAIL: a 3-day run for a beginner (cap 2) violates', () => {
    const week = buildWeek(['easy_run', 'easy_run', 'easy_run', null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'beginner' });
    const violation = result.violations.find((v) => v.code === 'RUN-04');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('ERROR');
    expect(violation?.affectedDays).toEqual([0, 1, 2]);
    expect(result.valid).toBe(false);
  });

  it('the same 3-day run is within the advanced cap (4) and does not violate', () => {
    const week = buildWeek(['easy_run', 'easy_run', 'easy_run', null, null, null, null]);
    const result = validateRunningWeek(week, { level: 'advanced' });
    expect(result.violations.some((v) => v.code === 'RUN-04')).toBe(false);
  });

  it('a trailing run through the end of the week (no rest day after it) is still caught', () => {
    const week = buildWeek([null, null, null, null, 'easy_run', 'easy_run', 'easy_run']);
    const result = validateRunningWeek(week, { level: 'beginner' });
    const violation = result.violations.find((v) => v.code === 'RUN-04');
    expect(violation?.affectedDays).toEqual([4, 5, 6]);
  });
});

describe('RUN-06 — a day set is not approved before validation', () => {
  it('PASS: preferredRunningDays(4) wrapped into a week passes validateRunningWeek for a beginner', () => {
    const proposedDays = preferredRunningDays(4);
    const roles: Array<RunningDayRole | null> = Array(7).fill(null);
    for (const d of proposedDays) roles[d] = 'easy_run';
    const result = validateRunningWeek(buildWeek(roles), { level: 'beginner' });
    expect(result.valid).toBe(true);
  });

  it('FAIL: a hand-built day set that was never checked (3 consecutive days, beginner cap 2) is rejected by the gate', () => {
    const naiveWeek = buildWeek(['easy_run', 'easy_run', 'easy_run', null, null, null, null]);
    const result = validateRunningWeek(naiveWeek, { level: 'beginner' });
    expect(result.valid).toBe(false);
  });

  it('preferredRunningDays is level-agnostic: a count with no valid spread for a beginner is still returned as-is — validateRunningWeek is what catches it, not the generator', () => {
    // 6 days/week: only 1 rest day is available to split 6 training days,
    // so the best possible spread is two 3-day runs — mathematically
    // impossible to keep every run within a beginner's cap of 2.
    const days = preferredRunningDays(6);
    expect(days).toEqual([0, 1, 2, 4, 5, 6]); // still returned, not rejected or clamped
    const roles: Array<RunningDayRole | null> = Array(7).fill(null);
    for (const d of days) roles[d] = 'easy_run';
    const result = validateRunningWeek(buildWeek(roles), { level: 'beginner' });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'RUN-04')).toBe(true);
    // The exact same days pass for an advanced runner (cap 4) — the
    // generator's output didn't change; only the validation context did.
    const advancedResult = validateRunningWeek(buildWeek(roles), { level: 'advanced' });
    expect(advancedResult.valid).toBe(true);
  });
});

describe('runningCriticalityOrder — RUN-05 (boundary is 5km, not 10km)', () => {
  it('above 5km uses the long-distance order (long run protected until the end)', () => {
    expect(runningCriticalityOrder({ targetDistanceKm: 21 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
    expect(runningCriticalityOrder({ targetDistanceKm: 10 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
    // The 5-10km range used to be undefined — now explicitly long-order,
    // same as 10km and above, not a third order of its own.
    expect(runningCriticalityOrder({ targetDistanceKm: 8 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
    // Just above the boundary itself.
    expect(runningCriticalityOrder({ targetDistanceKm: 5.1 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
  });

  it('at or below 5km uses the short-distance order (quality protected until the end)', () => {
    expect(runningCriticalityOrder({ targetDistanceKm: 5 })).toEqual([
      'easy_run', 'long_run', 'quality_secondary', 'quality_primary',
    ]);
    expect(runningCriticalityOrder({ targetDistanceKm: 3 })).toEqual([
      'easy_run', 'long_run', 'quality_secondary', 'quality_primary',
    ]);
  });
});

describe('shape unification (06.09.2026) — slotType present vs absent', () => {
  it('the same week validates identically with explicit slotTypes or category-only (no slotType at all) — RUN-01/02/04 never distinguish quality_primary from quality_secondary', () => {
    const slotTypes: Array<RunningDayRole | null> = ['quality_primary', null, 'quality_secondary', null, 'long_run', null, null];
    const withSlotType = validateRunningWeek(buildWeek(slotTypes), { level: 'intermediate' });
    const withoutSlotType = validateRunningWeek(buildWeekWithoutSlotType(slotTypes), { level: 'intermediate' });
    expect(withoutSlotType).toEqual(withSlotType);
  });

  it('a violating week (RUN-04) also matches with or without slotType', () => {
    const slotTypes: Array<RunningDayRole | null> = ['easy_run', 'easy_run', 'easy_run', null, null, null, null];
    const withSlotType = validateRunningWeek(buildWeek(slotTypes), { level: 'beginner' });
    const withoutSlotType = validateRunningWeek(buildWeekWithoutSlotType(slotTypes), { level: 'beginner' });
    expect(withoutSlotType).toEqual(withSlotType);
  });

  describe('matchesSlotTypeForDrop — RUN-05\'s actual consumer of the primary/secondary distinction', () => {
    it('WITH slotType: exact match, slotTypeWasUnknown is always false', () => {
      const day: RunningWeekDay = { dayOfWeek: 0, category: 'tempo', slotType: 'quality_secondary' };
      expect(matchesSlotTypeForDrop(day, 'quality_secondary')).toEqual({ matches: true, slotTypeWasUnknown: false });
      expect(matchesSlotTypeForDrop(day, 'quality_primary')).toEqual({ matches: false, slotTypeWasUnknown: false });
    });

    it('WITHOUT slotType: long_run and easy_run are unambiguous, still slotTypeWasUnknown=false', () => {
      const longDay: RunningWeekDay = { dayOfWeek: 0, category: 'long_run' };
      expect(matchesSlotTypeForDrop(longDay, 'long_run')).toEqual({ matches: true, slotTypeWasUnknown: false });
      expect(matchesSlotTypeForDrop(longDay, 'easy_run')).toEqual({ matches: false, slotTypeWasUnknown: false });

      const easyDay: RunningWeekDay = { dayOfWeek: 0, category: 'easy_run' };
      expect(matchesSlotTypeForDrop(easyDay, 'easy_run')).toEqual({ matches: true, slotTypeWasUnknown: false });
    });

    it('WITHOUT slotType: a documented fallback, not a rule — a quality day matches EITHER quality tier, and slotTypeWasUnknown is true exactly then', () => {
      const qualityDay: RunningWeekDay = { dayOfWeek: 0, category: 'tempo' };
      expect(matchesSlotTypeForDrop(qualityDay, 'quality_primary')).toEqual({ matches: true, slotTypeWasUnknown: true });
      expect(matchesSlotTypeForDrop(qualityDay, 'quality_secondary')).toEqual({ matches: true, slotTypeWasUnknown: true });
      // Never matches the unrelated tiers, and never flags slotTypeWasUnknown for those checks.
      expect(matchesSlotTypeForDrop(qualityDay, 'long_run')).toEqual({ matches: false, slotTypeWasUnknown: false });
      expect(matchesSlotTypeForDrop(qualityDay, 'easy_run')).toEqual({ matches: false, slotTypeWasUnknown: false });
    });

    it('a rest day (category null) never matches anything, with or without slotType', () => {
      const rest: RunningWeekDay = { dayOfWeek: 0, category: null };
      for (const slotType of ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'] as RunningDayRole[]) {
        expect(matchesSlotTypeForDrop(rest, slotType)).toEqual({ matches: false, slotTypeWasUnknown: false });
      }
    });
  });
});

describe('checkSingleSessionSpike — RUN-08', () => {
  it('PASS: a 5% overshoot over the last-30-days longest run is none', () => {
    expect(checkSingleSessionSpike(10.5, 10)).toBe('none');
  });

  it('FAIL: overshoot above 100% is blocked (requires explicit user confirmation, not auto-rejected)', () => {
    expect(checkSingleSessionSpike(25, 10)).toBe('blocked');
  });

  it('bands the [10%,30%) range as flagged', () => {
    expect(checkSingleSessionSpike(11, 10)).toBe('flagged');
    expect(checkSingleSessionSpike(12.9, 10)).toBe('flagged');
  });

  it('bands the [30%,100%) range as explained', () => {
    expect(checkSingleSessionSpike(13, 10)).toBe('explained');
    expect(checkSingleSessionSpike(19.9, 10)).toBe('explained');
  });

  it('a planned distance at or below the 30-day longest run is never a spike', () => {
    expect(checkSingleSessionSpike(8, 10)).toBe('none');
    expect(checkSingleSessionSpike(10, 10)).toBe('none');
  });

  it('no running history in the last 30 days is reported as no-baseline, not none — "nothing to compare against" is not the same claim as "checked, and it is safe"', () => {
    expect(checkSingleSessionSpike(5, 0)).toBe('no-baseline');
    expect(checkSingleSessionSpike(5, -3)).toBe('no-baseline');
  });
});
