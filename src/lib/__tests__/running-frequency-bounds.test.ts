import { describe, it, expect } from 'vitest';
import { MIN_RUNNING_FREQUENCY, MAX_RUNNING_FREQUENCY, clampRunningFrequency } from '../running-frequency-bounds';

describe('running-frequency-bounds', () => {
  it('MIN_RUNNING_FREQUENCY is 2, not 1 -- a single run/week is a different training model, not a low value of the same one', () => {
    expect(MIN_RUNNING_FREQUENCY).toBe(2);
  });

  it('MAX_RUNNING_FREQUENCY is 4', () => {
    expect(MAX_RUNNING_FREQUENCY).toBe(4);
  });

  describe('clampRunningFrequency', () => {
    it('clamps 1 up to 2 -- the exact bug: a plan built for 2 runs/week with only 1 weekday to hang the second run on', () => {
      expect(clampRunningFrequency(1)).toBe(2);
    });

    it('clamps 0 and negative values up to 2', () => {
      expect(clampRunningFrequency(0)).toBe(2);
      expect(clampRunningFrequency(-5)).toBe(2);
    });

    it('leaves 2, 3, 4 unchanged', () => {
      expect(clampRunningFrequency(2)).toBe(2);
      expect(clampRunningFrequency(3)).toBe(3);
      expect(clampRunningFrequency(4)).toBe(4);
    });

    it('clamps 5+ down to 4', () => {
      expect(clampRunningFrequency(5)).toBe(4);
      expect(clampRunningFrequency(100)).toBe(4);
    });

    it('is idempotent -- clamping an already-clamped value returns the same value, so calling it twice (parseAnswers, then generation) never changes the answer', () => {
      for (const raw of [0, 1, 2, 3, 4, 5, 10]) {
        const once = clampRunningFrequency(raw);
        const twice = clampRunningFrequency(once);
        expect(twice).toBe(once);
      }
    });
  });
});
