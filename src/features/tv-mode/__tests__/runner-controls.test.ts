import { describe, expect, it, vi } from 'vitest';
import { createRunnerControls, REMOTE_PRESS_GUARD_MS } from '../core/runner-controls';
import { progressFromSnapshot } from '../core/runner-progress';
import { cueForSecond, cueSecond } from '../core/cues';

describe('remote controls → player actions', () => {
  it('next runs once per press: a double tap inside the guard is one press', () => {
    let t = 1000;
    const next = vi.fn();
    const c = createRunnerControls({ togglePause: vi.fn(), next }, () => t);
    c.next();
    t += 100;
    c.next();
    expect(next).toHaveBeenCalledTimes(1);
    t += REMOTE_PRESS_GUARD_MS;
    c.next();
    expect(next).toHaveBeenCalledTimes(2);
  });
  it('pause / resume always runs (two taps = pause then resume)', () => {
    const togglePause = vi.fn();
    const c = createRunnerControls({ togglePause, next: vi.fn() }, () => 0);
    c.togglePause();
    c.togglePause();
    expect(togglePause).toHaveBeenCalledTimes(2);
  });
  it('a button the player cannot honour is left out (the remote hides it)', () => {
    const c = createRunnerControls({ togglePause: vi.fn(), next: vi.fn() });
    expect(c.prev).toBeUndefined();
    expect(c.skipExercise).toBeUndefined();
    const full = createRunnerControls({ togglePause: vi.fn(), next: vi.fn(), prev: vi.fn(), skipExercise: vi.fn() });
    expect(typeof full.prev).toBe('function');
    expect(typeof full.skipExercise).toBe('function');
  });
  it('each advancing button has its own guard', () => {
    const prev = vi.fn();
    const skip = vi.fn();
    const c = createRunnerControls({ togglePause: vi.fn(), next: vi.fn(), prev, skipExercise: skip }, () => 5);
    c.prev?.();
    c.skipExercise?.();
    expect(prev).toHaveBeenCalledTimes(1);
    expect(skip).toHaveBeenCalledTimes(1);
  });
});

describe('participant progress', () => {
  it('maps the phase to the friends-row state', () => {
    expect(progressFromSnapshot({ phase: 'work', setIndex: 2, setCount: 4 })).toEqual({ state: 'active', set: 2, totalSets: 4 });
    expect(progressFromSnapshot({ phase: 'rest', setIndex: 2, setCount: 4 }).state).toBe('resting');
    expect(progressFromSnapshot({ phase: 'done', setIndex: 4, setCount: 4 }).state).toBe('done');
  });
});

describe('countdown cues on the TV', () => {
  it('short beeps at 3-2-1, a long one at the end, nothing else, nothing twice', () => {
    expect(cueForSecond(null, 3)).toBeNull(); // first sight of a clock never beeps
    expect(cueForSecond(4, 3)).toBe('short');
    expect(cueForSecond(3, 2)).toBe('short');
    expect(cueForSecond(2, 1)).toBe('short');
    expect(cueForSecond(1, 0)).toBe('long');
    expect(cueForSecond(2, 2)).toBeNull();
    expect(cueForSecond(10, 9)).toBeNull();
    expect(cueForSecond(0, 0)).toBeNull();
  });
  it('the cue second is the displayed second until the real end', () => {
    expect(cueSecond(3400)).toBe(3);
    expect(cueSecond(1000)).toBe(1);
    expect(cueSecond(400)).toBe(1); // displays 0:00 but there is still time
    expect(cueSecond(0)).toBe(0);
  });
});
