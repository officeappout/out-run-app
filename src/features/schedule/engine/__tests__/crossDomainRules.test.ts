import { describe, it, expect } from 'vitest';
import {
  validateCrossDomain,
  resolveDoubleDayOrder,
  type CrossDomainWeek,
} from '../crossDomainRules';
import type { RunningWeekDay } from '../runningRules';
import type { ScheduleDay, DayOfWeek } from '../../types/smartSchedule.types';

function emptyStrengthWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i as DayOfWeek,
    sessions: [],
    isRestDay: true,
    warnings: [],
  }));
}

function withStrengthSession(week: ScheduleDay[], dayOfWeek: number): ScheduleDay[] {
  const copy = week.map((d) => ({ ...d, sessions: [...d.sessions] }));
  copy[dayOfWeek] = {
    ...copy[dayOfWeek],
    isRestDay: false,
    sessions: [{ skillId: 'PLANCHE', volumePercent: 100, sessionType: 'FULL' }],
  };
  return copy;
}

function emptyRunningWeek(): RunningWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
}

function withRunningDay(
  week: RunningWeekDay[],
  dayOfWeek: number,
  category: RunningWeekDay['category'],
  isQualityWorkout?: boolean,
): RunningWeekDay[] {
  return week.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, category, isQualityWorkout } : d));
}

const DEFAULT_CONTEXT = { minStrengthDaysPerWeek: 2 };

describe('validateCrossDomain — R1 (a shared day is permitted on its own)', () => {
  it('PASS: strength + an easy run on the same day, nothing else wrong, produces zero violations', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(emptyStrengthWeek(), 0),
      running: withRunningDay(emptyRunningWeek(), 0, 'easy_run'),
    };
    // 3rd strength day elsewhere so R7's floor (2) isn't what's being tested here.
    const withThirdDay: CrossDomainWeek = { ...week, strength: withStrengthSession(week.strength, 2) };
    const result = validateCrossDomain(withThirdDay, DEFAULT_CONTEXT);
    expect(result.violations.filter((v) => v.affectedDays.includes(0))).toEqual([]);
  });
});

describe('resolveDoubleDayOrder — R2 is a decision, not a validation (never appears in validateCrossDomain)', () => {
  it('PASS: a non-quality run recommends strength-first', () => {
    const order = resolveDoubleDayOrder(
      { strength: withStrengthSession(emptyStrengthWeek(), 0)[0], running: { dayOfWeek: 0, category: 'easy_run' } },
      DEFAULT_CONTEXT,
    );
    expect(order).toBe('strength-first');
  });

  it('FAIL-catching: a quality run recommends running-first, not strength-first', () => {
    const order = resolveDoubleDayOrder(
      { strength: withStrengthSession(emptyStrengthWeek(), 0)[0], running: { dayOfWeek: 0, category: 'tempo' } },
      DEFAULT_CONTEXT,
    );
    expect(order).toBe('running-first');
  });

  it('never contributes a violation to validateCrossDomain — R2 is absent from every result', () => {
    const weeks: CrossDomainWeek[] = [
      {
        strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
        running: withRunningDay(emptyRunningWeek(), 0, 'easy_run'),
      },
      {
        strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
        running: withRunningDay(emptyRunningWeek(), 0, 'tempo'),
      },
    ];
    for (const week of weeks) {
      const result = validateCrossDomain(week, DEFAULT_CONTEXT);
      expect(result.violations.some((v) => v.code === 'R2')).toBe(false);
    }
  });
});

describe('validateCrossDomain — R3 (never strength BEFORE a quality run — an order ban, not a sharing ban)', () => {
  it('PASS: strength and an easy run on the same day is valid', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'easy_run'),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(false);
  });

  it('FAIL: strength and a quality run (tempo), order unspecified (defaults to strength-first, the conservative assumption), is invalid', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'tempo'),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    const r3 = result.violations.find((v) => v.code === 'R3');
    expect(r3).toBeDefined();
    expect(r3?.severity).toBe('ERROR');
    expect(r3?.affectedDays).toEqual([0]);
    expect(result.valid).toBe(false);
  });

  it('FAIL: the same day, with order explicitly set to strength-first, is still invalid — the ban is real, not just a default artifact', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'tempo'),
      sharedDayOrder: { 0: 'strength-first' },
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('PASS: a quality run (tempo) shared with strength, ordered running-first, is legal — R3 bans the order, not the day. Proof this is a real, reachable state and not just R3 gone silent: R2 (resolveDoubleDayOrder) exists in the source doc specifically to choose an order for this exact case — if R3 banned the day outright, R2 would have nothing to decide.', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'tempo'),
      sharedDayOrder: { 0: 'running-first' },
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(false);
    // Not just "R3 absent" — the whole candidate must be valid: confirms no
    // other rule (R6/R7/R8) independently blocks this same day, which is
    // exactly the check David asked to stop and report on if it ever fails.
    expect(result.valid).toBe(true);
  });

  it('category-derived quality: short_intervals (no isQualityWorkout field at all) still triggers R3', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'short_intervals'), // isQualityWorkout left undefined
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(true);
  });

  it('isQualityWorkout overrides category when both are present: a long_run explicitly marked isQualityWorkout:true still triggers R3', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'long_run', true),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(true);
  });

  it('isQualityWorkout overrides category the other way too: tempo explicitly marked isQualityWorkout:false does NOT trigger R3', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'tempo', false),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R3')).toBe(false);
  });
});

describe('validateCrossDomain — R6 first half (never strength + the long run, same day)', () => {
  it('PASS: strength and a long run on different days is valid', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 4, 'long_run'),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R6')).toBe(false);
  });

  it('FAIL: strength and the long run on the same day is invalid', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: withRunningDay(emptyRunningWeek(), 0, 'long_run'),
    };
    const result = validateCrossDomain(week, DEFAULT_CONTEXT);
    const r6 = result.violations.find((v) => v.code === 'R6');
    expect(r6).toBeDefined();
    expect(r6?.severity).toBe('ERROR');
    expect(result.valid).toBe(false);
  });
});

describe('validateCrossDomain — R7 (floor: at least minStrengthDaysPerWeek strength days)', () => {
  it('PASS: 2 strength days meets a floor of 2', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      running: emptyRunningWeek(),
    };
    const result = validateCrossDomain(week, { minStrengthDaysPerWeek: 2 });
    expect(result.violations.some((v) => v.code === 'R7')).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('FAIL: 1 strength day is below a floor of 2', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(emptyStrengthWeek(), 0),
      running: emptyRunningWeek(),
    };
    const result = validateCrossDomain(week, { minStrengthDaysPerWeek: 2 });
    const r7 = result.violations.find((v) => v.code === 'R7');
    expect(r7).toBeDefined();
    expect(r7?.severity).toBe('ERROR');
    expect(result.valid).toBe(false);
  });

  it('the floor is a context parameter, not a hardcoded constant — a floor of 1 makes the same week pass', () => {
    const week: CrossDomainWeek = {
      strength: withStrengthSession(emptyStrengthWeek(), 0),
      running: emptyRunningWeek(),
    };
    const result = validateCrossDomain(week, { minStrengthDaysPerWeek: 1 });
    expect(result.violations.some((v) => v.code === 'R7')).toBe(false);
  });
});

describe('validateCrossDomain — R8 (≤4 total workouts → at most one shared day)', () => {
  it('PASS: 2 strength + 2 running, one shared day, 4 total workouts — exactly one shared day is fine', () => {
    const strength = withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2);
    const running = withRunningDay(withRunningDay(emptyRunningWeek(), 0, 'easy_run'), 4, 'easy_run');
    const result = validateCrossDomain({ strength, running }, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R8')).toBe(false);
  });

  it('FAIL: 2 strength + 2 running, BOTH days shared, 4 total workouts — two shared days violates R8', () => {
    const strength = withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2);
    const running = withRunningDay(withRunningDay(emptyRunningWeek(), 0, 'easy_run'), 2, 'easy_run');
    const result = validateCrossDomain({ strength, running }, DEFAULT_CONTEXT);
    const r8 = result.violations.find((v) => v.code === 'R8');
    expect(r8).toBeDefined();
    expect(r8?.severity).toBe('ERROR');
    expect(r8?.affectedDays.sort()).toEqual([0, 2]);
    expect(result.valid).toBe(false);
  });

  it('two shared days is fine once total workouts exceeds 4 (R8 only applies at ≤4 total)', () => {
    const strength = withStrengthSession(
      withStrengthSession(withStrengthSession(emptyStrengthWeek(), 0), 2),
      4,
    );
    const running = withRunningDay(
      withRunningDay(withRunningDay(emptyRunningWeek(), 0, 'easy_run'), 2, 'easy_run'),
      5,
      'easy_run',
    );
    // 3 strength + 3 running = 6 total, above the ≤4 threshold.
    const result = validateCrossDomain({ strength, running }, DEFAULT_CONTEXT);
    expect(result.violations.some((v) => v.code === 'R8')).toBe(false);
  });
});
