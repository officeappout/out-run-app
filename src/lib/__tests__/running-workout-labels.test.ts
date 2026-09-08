import { describe, it, expect } from 'vitest';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '../running-workout-labels';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

// The canonical 11, spelled out explicitly here (not imported as an array
// from running.types.ts, since no such array exists) so this test doesn't
// silently pass if the source file's own Record type is ever loosened.
const ALL_CATEGORIES: WorkoutCategory[] = [
  'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured',
  'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'long_run', 'easy_run', 'strides',
];

describe('RUNNING_WORKOUT_CATEGORY_LABELS_HE', () => {
  it('covers all 11 real WorkoutCategory values with a non-empty label, and exactly 11 keys total', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE[cat]).toBeTruthy();
    }
    expect(Object.keys(RUNNING_WORKOUT_CATEGORY_LABELS_HE)).toHaveLength(11);
  });

  it('does not include "recovery" as a key — confirmed (05.09.2026) it was never a real WorkoutCategory value anywhere in the codebase', () => {
    expect('recovery' in RUNNING_WORKOUT_CATEGORY_LABELS_HE).toBe(false);
  });

  it('preserves the exact Hebrew labels the 5 previously-independent maps already agreed on — regression check, not a new decision', () => {
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.easy_run).toBe('ריצה קלה');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.long_run).toBe('ריצה ארוכה');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.short_intervals).toBe('אינטרוולים קצרים');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.long_intervals).toBe('אינטרוולים ארוכים');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.fartlek_easy).toBe('פארטלק קל');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.fartlek_structured).toBe('פארטלק מובנה');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.tempo).toBe('ריצת טמפו');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.hill_long).toBe('עליות ארוכות');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.hill_short).toBe('עליות קצרות');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.hill_sprints).toBe('ספרינט עליות');
    expect(RUNNING_WORKOUT_CATEGORY_LABELS_HE.strides).toBe('סטריידים');
  });
});
