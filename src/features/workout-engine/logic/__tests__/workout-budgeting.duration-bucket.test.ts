import { describe, it, expect, vi, afterEach } from 'vitest';
import { getExerciseCountForDuration } from '../workout-budgeting.utils';

// Bug fix regression test — workout-budgeting.utils.ts:~122-134
//
// Before the fix, `else if (availableTime <= 30) config = DURATION_SCALING['15']`
// caught a 30-minute request before it could ever reach the dedicated '30'
// bucket (min:5, max:6). t=30 silently produced the exact same exercise-count
// range as t=20 (min:4, max:5) instead of the documented 5-6 range.
//
// Math.random is pinned to 0.999 so `Math.floor(rand * (max-min+1))` always
// resolves to `max` — this deterministically exposes which bucket was used.

describe('getExerciseCountForDuration — 30-minute bucket', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('t=20 and t=30 now resolve to DIFFERENT buckets (was identical before the fix)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // forces exerciseCount = config.max

    const t20 = getExerciseCountForDuration(20);
    const t30 = getExerciseCountForDuration(30);

    // documented buckets: '15' → max 5, '30' → max 6
    expect(t20.exerciseCount).toBe(5);
    expect(t30.exerciseCount).toBe(6); // BEFORE the fix this was also 5 (same as t20)
    expect(t30.exerciseCount).not.toBe(t20.exerciseCount);
  });

  it('t=30 lands in the documented 5-6 exercise range, not the 15-bucket 4-5 range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces exerciseCount = config.min
    const t30Min = getExerciseCountForDuration(30);
    expect(t30Min.exerciseCount).toBe(5); // '30' bucket min

    vi.spyOn(Math, 'random').mockReturnValue(0.999); // forces exerciseCount = config.max
    const t30Max = getExerciseCountForDuration(30);
    expect(t30Max.exerciseCount).toBe(6); // '30' bucket max (was unreachable before the fix)
  });

  it('boundary sanity: t=29 still uses the 15-bucket, t=31 still uses the 45-bucket', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(getExerciseCountForDuration(29).exerciseCount).toBe(5); // '15' bucket max
    expect(getExerciseCountForDuration(31).exerciseCount).toBe(8); // '45' bucket max
    expect(getExerciseCountForDuration(31).includeAccessories).toBe(true);
    expect(getExerciseCountForDuration(30).includeAccessories).toBe(false);
  });
});
