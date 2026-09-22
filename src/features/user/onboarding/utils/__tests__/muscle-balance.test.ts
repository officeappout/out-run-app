import { describe, it, expect } from 'vitest';
import {
  deriveMuscleBalanceCase,
  recommendedMusclesForCase,
  PUSH_MUSCLES,
  PULL_MUSCLES,
  UPPER_MUSCLES,
  LOWER_MUSCLES,
} from '../muscle-balance';

describe('deriveMuscleBalanceCase', () => {
  it('empty selection: no case', () => {
    expect(deriveMuscleBalanceCase([])).toBeNull();
  });

  it('full-body chip selected: exempt, no case, regardless of the expanded muscle list', () => {
    expect(deriveMuscleBalanceCase(['full_body'])).toBeNull();
    expect(
      deriveMuscleBalanceCase(['full_body', 'chest', 'back', 'legs', 'core']),
    ).toBeNull();
  });

  it('case 1: strictly push only (chest alone)', () => {
    expect(deriveMuscleBalanceCase(['chest'])).toBe('push_only');
  });

  it('case 1: strictly push only (multiple push muscles)', () => {
    expect(deriveMuscleBalanceCase(['chest', 'shoulders', 'triceps'])).toBe('push_only');
  });

  it('case 2: strictly pull only', () => {
    expect(deriveMuscleBalanceCase(['back'])).toBe('pull_only');
    expect(deriveMuscleBalanceCase(['back', 'biceps'])).toBe('pull_only');
  });

  it('case 3: mixed push+pull (no lower) falls through push/pull checks to upper_only', () => {
    expect(deriveMuscleBalanceCase(['chest', 'back'])).toBe('upper_only');
  });

  it('case 3: push-only would also satisfy "only upper" but push/pull is checked first', () => {
    // Regression guard for the explicit ordering requirement — a pure push
    // selection must resolve to push_only, never fall through to upper_only.
    expect(deriveMuscleBalanceCase(['triceps'])).toBe('push_only');
  });

  it('case 4: strictly lower only (legs/core/glutes)', () => {
    expect(deriveMuscleBalanceCase(['legs'])).toBe('lower_only');
    expect(deriveMuscleBalanceCase(['core'])).toBe('lower_only');
    expect(deriveMuscleBalanceCase(['legs', 'core', 'glutes'])).toBe('lower_only');
  });

  it('a genuinely balanced mix (upper AND lower both present) → no recommendation', () => {
    expect(deriveMuscleBalanceCase(['chest', 'legs'])).toBeNull();
    expect(deriveMuscleBalanceCase(['back', 'core'])).toBeNull();
    expect(deriveMuscleBalanceCase(['chest', 'back', 'legs', 'core'])).toBeNull();
  });
});

describe('recommendedMusclesForCase', () => {
  it('push_only recommends the pull set', () => {
    expect(recommendedMusclesForCase('push_only')).toBe(PULL_MUSCLES);
  });

  it('pull_only recommends the push set', () => {
    expect(recommendedMusclesForCase('pull_only')).toBe(PUSH_MUSCLES);
  });

  it('upper_only recommends the lower set', () => {
    expect(recommendedMusclesForCase('upper_only')).toBe(LOWER_MUSCLES);
  });

  it('lower_only recommends the full upper set (either push or pull completes it)', () => {
    expect(recommendedMusclesForCase('lower_only')).toBe(UPPER_MUSCLES);
  });

  it('null case recommends nothing', () => {
    expect(recommendedMusclesForCase(null)).toEqual(new Set());
  });
});
