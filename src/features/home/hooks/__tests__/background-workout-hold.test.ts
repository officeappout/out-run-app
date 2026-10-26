import { describe, expect, it } from 'vitest';
import { createBackgroundWorkoutHold } from '../background-workout-hold';

describe('background workout hold (park start must not turn into a home workout, owner 26.10)', () => {
  it('no park preview → background results apply as before', () => {
    const h = createBackgroundWorkoutHold<string>();
    expect(h.offerWorkout('home-1')).toBe(true);
    expect(h.offerControl()).toBe(true);
    expect(h.end()).toBeNull();
  });

  it('while a park workout is open, home\'s background trio is held, never applied', () => {
    const h = createBackgroundWorkoutHold<string>();
    h.begin();
    expect(h.isHeld()).toBe(true);
    expect(h.offerWorkout('home-trio')).toBe(false);
    expect(h.offerControl()).toBe(false);
  });

  it('closing the park preview hands back the latest home workout (also one generated before it)', () => {
    const early = createBackgroundWorkoutHold<string>();
    early.offerWorkout('home-early');
    early.begin();
    expect(early.end()).toBe('home-early');

    const late = createBackgroundWorkoutHold<string>();
    late.begin();
    late.offerWorkout('home-late');
    expect(late.end()).toBe('home-late');
    expect(late.isHeld()).toBe(false);
    expect(late.offerWorkout('next')).toBe(true);
  });

  it('a park preview with no home workout yet → nothing to restore', () => {
    const h = createBackgroundWorkoutHold<string>();
    h.begin();
    expect(h.end()).toBeNull();
  });
});
