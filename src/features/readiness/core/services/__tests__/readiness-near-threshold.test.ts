import { describe, it, expect } from 'vitest';
import { computeNearThreshold, DEFAULT_CLOSE_TOLERANCES, type FailedComponentInput } from '../readiness-near-threshold';

const RUN: FailedComponentInput = {
  testId: 'run_3000m',
  label: 'ריצה',
  unit: 'seconds',
  value: 1110, // 1110 - 1080 = 30s over
  thresholdValue: 1080,
  lowerIsBetter: true,
};

const PULLUPS: FailedComponentInput = {
  testId: 'pullups',
  label: 'עליות מתח',
  unit: 'reps',
  value: 2, // threshold 3, 1 rep short
  thresholdValue: 3,
  lowerIsBetter: false,
};

describe('computeNearThreshold — no failed components', () => {
  it('empty list → never near (nothing to be near to)', () => {
    expect(computeNearThreshold([])).toEqual({ isNear: false, note: null });
  });
});

describe('computeNearThreshold — single failed component', () => {
  it('30s over a 60s tolerance → close, note shows the real distance', () => {
    const result = computeNearThreshold([RUN]);
    expect(result.isNear).toBe(true);
    expect(result.note).toBe('ריצה · 30 שניות מהסף');
  });

  it('1 rep short of a 1-rep tolerance → close, singular Hebrew wording ("חזרה אחת", not "1 חזרות")', () => {
    const result = computeNearThreshold([PULLUPS]);
    expect(result.isNear).toBe(true);
    expect(result.note).toBe('עליות מתח · חזרה אחת מהסף');
  });

  it('2 reps short, with a wider 2-rep tolerance → close, plural wording ("2 חזרות")', () => {
    // 3 - 1 = 2 short — exceeds the default 1-rep tolerance (would be
    // "not close"), so this uses an explicit override purely to exercise
    // the plural-vs-singular formatting branch, not the default config.
    const result = computeNearThreshold([{ ...PULLUPS, value: 1 }], { pullups: 2 });
    expect(result.isNear).toBe(true);
    expect(result.note).toBe('עליות מתח · 2 חזרות מהסף');
  });

  it('far over (4 minutes) → not close, no note (never promise an easy win)', () => {
    const far = { ...RUN, value: 1080 + 240 };
    const result = computeNearThreshold([far]);
    expect(result).toEqual({ isNear: false, note: null });
  });
});

describe('computeNearThreshold — exact boundary (David\'s pre-merge test list)', () => {
  it('distance exactly 60s at a 60s tolerance → close', () => {
    const result = computeNearThreshold([{ ...RUN, value: 1080 + 60 }]);
    expect(result.isNear).toBe(true);
  });

  it('distance 61s at a 60s tolerance → not close', () => {
    const result = computeNearThreshold([{ ...RUN, value: 1080 + 61 }]);
    expect(result.isNear).toBe(false);
  });
});

describe('computeNearThreshold — the critical multi-component rule (David, locked)', () => {
  it('failed on two components, close on only one → NOT close overall (no partial promise)', () => {
    const closeRun = RUN; // 30s over, close
    const farPullups = { ...PULLUPS, value: 0 }; // 3 reps short, not close at tolerance 1
    const result = computeNearThreshold([closeRun, farPullups]);
    expect(result.isNear).toBe(false);
    expect(result.note).toBeNull();
  });

  it('failed on two components, close on BOTH → close overall, note lists both with their own distances', () => {
    const result = computeNearThreshold([RUN, PULLUPS]);
    expect(result.isNear).toBe(true);
    expect(result.note).toBe('ריצה · 30 שניות מהסף, עליות מתח · חזרה אחת מהסף');
  });
});

describe('computeNearThreshold — tolerance is configurable (David\'s pre-merge test list)', () => {
  it('lowering the run tolerance below the real distance flips a close soldier to not-close', () => {
    const defaultResult = computeNearThreshold([RUN], DEFAULT_CLOSE_TOLERANCES);
    expect(defaultResult.isNear).toBe(true);

    const stricterResult = computeNearThreshold([RUN], { ...DEFAULT_CLOSE_TOLERANCES, run_3000m: 10 });
    expect(stricterResult.isNear).toBe(false);
  });

  it('raising the tolerance above the real distance flips a not-close soldier to close', () => {
    const far = { ...RUN, value: 1080 + 240 }; // 4 minutes over
    expect(computeNearThreshold([far]).isNear).toBe(false);
    expect(computeNearThreshold([far], { ...DEFAULT_CLOSE_TOLERANCES, run_3000m: 300 }).isNear).toBe(true);
  });

  it('a test with no configured tolerance at all is never "close" — fail-safe, never promise an easy win we cannot vouch for', () => {
    const unconfigured: FailedComponentInput = { testId: 'swim', label: 'שחייה', unit: 'seconds', value: 61, thresholdValue: 60, lowerIsBetter: true };
    expect(computeNearThreshold([unconfigured], {}).isNear).toBe(false);
  });
});
