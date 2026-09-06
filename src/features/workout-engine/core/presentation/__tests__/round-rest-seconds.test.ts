import { describe, it, expect } from 'vitest';
import { roundRestSecondsForDisplay, roundRestSeconds } from '../PresentationFormatter';
import type { WorkoutExercise } from '../../../logic/workout-generator.types';

/**
 * 03-CHANGES.md Addendum 26 (06.09.2026): raw restSeconds is a random draw
 * inside a tier's [min,max] window — physiologically correct but not
 * countable (66, 67, 80, 82, 84, 87...). roundRestSeconds snaps the
 * DISPLAYED/used value to the nearest 15s at the presentation stage only.
 */
describe('roundRestSecondsForDisplay', () => {
  it('rounds the exact broken values David reported to the nearest 15s', () => {
    expect(roundRestSecondsForDisplay(66)).toBe(60);
    expect(roundRestSecondsForDisplay(67)).toBe(60);
    expect(roundRestSecondsForDisplay(80)).toBe(75);
    expect(roundRestSecondsForDisplay(82)).toBe(75);
    expect(roundRestSecondsForDisplay(84)).toBe(90);
    expect(roundRestSecondsForDisplay(87)).toBe(90);
    expect(roundRestSecondsForDisplay(90)).toBe(90);
    expect(roundRestSecondsForDisplay(105)).toBe(105);
  });

  it('rounds an elite-tier outlier to the nearest 15s too (still a multiple of 15)', () => {
    expect(roundRestSecondsForDisplay(223)).toBe(225);
  });

  it('never rounds below the 15s floor', () => {
    expect(roundRestSecondsForDisplay(1)).toBe(15);
    expect(roundRestSecondsForDisplay(7)).toBe(15);
  });

  it('leaves an already-round value unchanged', () => {
    expect(roundRestSecondsForDisplay(120)).toBe(120);
  });
});

function makeEx(restSeconds: number): WorkoutExercise {
  return { restSeconds } as any;
}

describe('roundRestSeconds (in-place array mutation)', () => {
  it('rounds every exercise restSeconds in place and returns the same array reference', () => {
    const exercises = [makeEx(66), makeEx(105), makeEx(223)];
    const result = roundRestSeconds(exercises);
    expect(result).toBe(exercises);
    expect(exercises.map(e => e.restSeconds)).toEqual([60, 105, 225]);
  });

  it('skips exercises with restSeconds:0 (follow-along clips — video controls pacing, not a countdown)', () => {
    const exercises = [makeEx(0)];
    roundRestSeconds(exercises);
    expect(exercises[0].restSeconds).toBe(0);
  });
});
