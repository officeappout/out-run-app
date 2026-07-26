import { describe, it, expect } from 'vitest';
import { calculateCalories as strengthCalories } from '@/features/workout-engine/components/strength/utils/summary.utils';
import { caloriesFromActivity, caloriesFromDifficulty, formatDuration } from '../format';

describe('summary/format — calorie SSOT', () => {
  it('difficulty axis matches the legacy strength fn exactly', () => {
    const cases = [
      [1800, 'hard', 75],
      [600, 'easy', 60],
      [1200, 'medium', 80],
    ] as const;
    for (const [sec, diff, w] of cases) {
      expect(caloriesFromDifficulty(sec, diff, w)).toBe(strengthCalories(sec, diff, w));
    }
  });

  it('activity axis pins to the canonical MET formula', () => {
    // running MET 8, 30 min, 75kg → (8·75·3.5)/200·30 = 315
    expect(caloriesFromActivity('running', 30, 75)).toBe(315);
    // walking MET 3.5, 20 min, 70kg → (3.5·70·3.5)/200·20 = 85.75 → 86
    expect(caloriesFromActivity('walking', 20, 70)).toBe(86);
  });

  it('the two MET axes are the same math for a shared MET', () => {
    // running=8 ≡ hard=8 ; walking=3.5 ≡ easy=3.5 (proves the 3.5/200 = 0.0175 unification)
    expect(caloriesFromActivity('running', 30, 75)).toBe(caloriesFromDifficulty(1800, 'hard', 75));
    expect(caloriesFromActivity('walking', 20, 70)).toBe(caloriesFromDifficulty(1200, 'easy', 70));
  });

  it('defaults weight to 75kg when omitted/zero', () => {
    expect(caloriesFromActivity('running', 30)).toBe(caloriesFromActivity('running', 30, 75));
    expect(caloriesFromDifficulty(1800, 'hard', 0)).toBe(caloriesFromDifficulty(1800, 'hard', 75));
  });
});

describe('summary/format — formatDuration', () => {
  it('MM:SS under an hour', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(599)).toBe('09:59');
  });

  it('H:MM:SS at/over an hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('guards negatives and NaN', () => {
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(NaN)).toBe('00:00');
  });
});
