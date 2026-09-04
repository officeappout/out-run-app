import { describe, it, expect } from 'vitest';
import {
  preferredRunningDays,
  validateRunningWeek,
  runningCriticalityOrder,
  checkSingleSessionSpike,
  type RunningDayRole,
  type RunningWeekDay,
} from '../runningRules';

function buildWeek(roles: Array<RunningDayRole | null>): RunningWeekDay[] {
  if (roles.length !== 7) throw new Error('buildWeek requires exactly 7 entries');
  return roles.map((role, dayOfWeek) => ({ dayOfWeek, role }));
}

describe('preferredRunningDays', () => {
  it('count=0 returns an empty set', () => {
    expect(preferredRunningDays(0, 'beginner')).toEqual([]);
  });

  it('count=7 returns every day', () => {
    expect(preferredRunningDays(7, 'advanced')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('count=4 spreads evenly across the whole week — not the old [1,2,4,5] two-adjacent-pairs shape', () => {
    const days = preferredRunningDays(4, 'beginner');
    expect(days).toEqual([0, 2, 4, 6]);
    // Explicitly the regression this function exists to fix.
    expect(days).not.toEqual([1, 2, 4, 5]);
  });

  it('count=5 keeps the longest run at 2, not front-loaded into a run of 3', () => {
    expect(preferredRunningDays(5, 'intermediate')).toEqual([0, 1, 3, 4, 6]);
  });

  it('is deterministic for the same input', () => {
    const a = preferredRunningDays(3, 'beginner');
    const b = preferredRunningDays(3, 'beginner');
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
  it('PASS: preferredRunningDays(4, beginner) wrapped into a week passes validateRunningWeek', () => {
    const proposedDays = preferredRunningDays(4, 'beginner');
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
});

describe('runningCriticalityOrder — RUN-05', () => {
  it('≥10km uses the long-distance order (long run protected until the end)', () => {
    expect(runningCriticalityOrder({ targetDistanceKm: 10 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
    expect(runningCriticalityOrder({ targetDistanceKm: 21 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
  });

  it('≤5km uses the short-distance order (quality protected until the end)', () => {
    expect(runningCriticalityOrder({ targetDistanceKm: 5 })).toEqual([
      'easy_run', 'long_run', 'quality_secondary', 'quality_primary',
    ]);
    expect(runningCriticalityOrder({ targetDistanceKm: 3 })).toEqual([
      'easy_run', 'long_run', 'quality_secondary', 'quality_primary',
    ]);
  });

  it('the explicitly-undefined 5–10km gap resolves to the long-distance order', () => {
    expect(runningCriticalityOrder({ targetDistanceKm: 7 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
    // Just above the short-distance boundary — the split point is >5, not >=5.
    expect(runningCriticalityOrder({ targetDistanceKm: 5.1 })).toEqual([
      'easy_run', 'quality_secondary', 'long_run', 'quality_primary',
    ]);
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

  it('no running history in the last 30 days (no baseline) is reported as none, not a divide-by-zero spike', () => {
    expect(checkSingleSessionSpike(5, 0)).toBe('none');
  });
});
