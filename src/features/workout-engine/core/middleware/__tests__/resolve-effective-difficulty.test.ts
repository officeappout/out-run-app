import { describe, it, expect } from 'vitest';
import { resolveEffectiveDifficulty } from '../InputSanitizerMiddleware';

/**
 * F2 (David's decision, docs/workout-engine/03-CHANGES.md Addendum 17/20;
 * 00-PLAN.md §16): SAFETY-motivated overrides (first-session,
 * detraining-lock, deload week) stay, but now surface a user-facing
 * `overrideNote` — an explicit pick that gets overridden must never look
 * like a silent bug. The OPTIMIZATION-motivated override (peak-week floor,
 * D1→D2) was removed entirely — not a safety concern, the engine
 * second-guessing an explicit "easy" pick.
 */
describe('resolveEffectiveDifficulty — safety overrides stay, with a user-facing note', () => {
  it('first-session guard: forces D1 regardless of request, with a note', () => {
    const result = resolveEffectiveDifficulty(3, { detrainingLock: false, periodizationWeek: 1 }, true);
    expect(result.difficulty).toBe(1);
    expect(result.overrideNote).toBeTruthy();
  });

  it('detraining lock: D3 request → D2, with a note', () => {
    const result = resolveEffectiveDifficulty(3, { detrainingLock: true, periodizationWeek: 1 }, false);
    expect(result.difficulty).toBe(2);
    expect(result.overrideNote).toBeTruthy();
  });

  it('deload week (W5): D3 request → D1, with a note', () => {
    const result = resolveEffectiveDifficulty(3, { detrainingLock: false, periodizationWeek: 5 }, false);
    expect(result.difficulty).toBe(1);
    expect(result.overrideNote).toBeTruthy();
  });

  it('no override fires → no note, difficulty passes through unchanged', () => {
    const result = resolveEffectiveDifficulty(2, { detrainingLock: false, periodizationWeek: 2 }, false);
    expect(result.difficulty).toBe(2);
    expect(result.overrideNote).toBeUndefined();
  });

  it('detraining lock does NOT touch a D1 or D2 request (only guards against D3)', () => {
    expect(resolveEffectiveDifficulty(1, { detrainingLock: true, periodizationWeek: 1 }, false)).toEqual({ difficulty: 1, overrideNote: undefined });
    expect(resolveEffectiveDifficulty(2, { detrainingLock: true, periodizationWeek: 1 }, false)).toEqual({ difficulty: 2, overrideNote: undefined });
  });
});

describe('resolveEffectiveDifficulty — peak-week optimization override REMOVED (F2)', () => {
  it('peak week (W4) + explicit D1 request → stays D1, no override, no note (this used to silently become D2)', () => {
    const result = resolveEffectiveDifficulty(1, { detrainingLock: false, periodizationWeek: 4 }, false);
    expect(result.difficulty).toBe(1);
    expect(result.overrideNote).toBeUndefined();
  });

  it('peak week + D2/D3 requests are unaffected either way', () => {
    expect(resolveEffectiveDifficulty(2, { detrainingLock: false, periodizationWeek: 4 }, false).difficulty).toBe(2);
    expect(resolveEffectiveDifficulty(3, { detrainingLock: false, periodizationWeek: 4 }, false).difficulty).toBe(3);
  });
});
