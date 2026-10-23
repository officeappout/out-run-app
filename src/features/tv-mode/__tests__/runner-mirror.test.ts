/** The runner → mirror diff: what counts as a change, how the clock is anchored, pause / resume, late media. */
import { describe, expect, it } from 'vitest';
import { advanceRunnerMirror, mirrorForWrite, startRunnerMirror } from '../core/runner-mirror';
import { IDLE_SNAPSHOT_TIMER, type RunnerSnapshot } from '../core/runner-snapshot';
import { timerChanged } from '../core/mirror';

const snap = (over: Partial<RunnerSnapshot> = {}): RunnerSnapshot => ({
  exerciseKey: '0:0:pullup',
  exerciseIndex: 0,
  exerciseCount: 5,
  exerciseId: 'pullup',
  exerciseName: 'מתח רחב',
  nextExerciseName: 'מקבילים',
  media: { videoUrl: 'https://cdn.example.com/a.mp4', imageUrl: 'https://cdn.example.com/a.jpg' },
  nextMedia: { imageUrl: 'https://cdn.example.com/b.jpg' },
  mode: 'strength',
  setIndex: 1,
  setCount: 4,
  repsMin: 8,
  repsMax: 12,
  phase: 'work',
  paused: false,
  timer: IDLE_SNAPSHOT_TIMER,
  together: false,
  ...over,
});
const rest = (leftMs: number, over: Partial<RunnerSnapshot> = {}): RunnerSnapshot =>
  snap({ phase: 'rest', timer: { dir: 'down', baseMs: leftMs, running: true, totalMs: 60_000 }, ...over });

const T0 = 1_000_000;

describe('advanceRunnerMirror', () => {
  it('the first snapshot becomes the exercise: names, sets, targets, media and mode', () => {
    const s = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    expect(s.mirror).toMatchObject({
      phase: 'work', exerciseIndex: 0, exerciseCount: 5, exerciseName: 'מתח רחב', nextExerciseName: 'מקבילים',
      setIndex: 1, setCount: 4, repsMin: 8, repsMax: 12, mode: 'strength', paused: false, together: false,
    });
    expect(s.mirror.media).toEqual({ videoUrl: 'https://cdn.example.com/a.mp4', imageUrl: 'https://cdn.example.com/a.jpg' });
    expect(s.mirror.nextMedia).toEqual({ imageUrl: 'https://cdn.example.com/b.jpg' });
  });

  it('seq starts at the clock, so a player that mounts again always outranks the previous one', () => {
    const a = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    const b = advanceRunnerMirror(startRunnerMirror(T0 + 60_000), snap(), T0 + 60_000);
    expect(b.mirror.seq).toBeGreaterThan(a.mirror.seq);
  });

  it('an identical snapshot is not a change (same object back, nothing to write)', () => {
    const a = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    expect(advanceRunnerMirror(a, snap(), T0 + 500)).toBe(a);
  });

  it('a ticking rest second is not a change; a +15s extension or a restart is', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    s = advanceRunnerMirror(s, rest(60_000), T0 + 1000);
    const seq = s.mirror.seq;
    expect(s.mirror.phase).toBe('rest');
    for (let i = 1; i <= 10; i++) s = advanceRunnerMirror(s, rest(60_000 - i * 1000), T0 + 1000 + i * 1000);
    expect(s.mirror.seq).toBe(seq); // ten ticks, no write
    const extended = advanceRunnerMirror(s, rest(60_000 - 10_000 + 15_000), T0 + 11_000);
    expect(extended.mirror.seq).toBeGreaterThan(seq);
    expect(extended.mirror.timer.baseMs).toBe(65_000);
  });

  it('the next set only changes the set index; the next exercise restarts the set and the timer', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    s = advanceRunnerMirror(s, snap({ setIndex: 2 }), T0 + 1);
    expect(s.mirror.setIndex).toBe(2);
    expect(s.mirror.exerciseName).toBe('מתח רחב');
    s = advanceRunnerMirror(s, snap({ exerciseKey: '0:1:dips', exerciseIndex: 1, exerciseId: 'dips', exerciseName: 'מקבילים', nextExerciseName: undefined, setIndex: 1 }), T0 + 2);
    expect(s.mirror).toMatchObject({ exerciseIndex: 1, exerciseName: 'מקבילים', setIndex: 1, phase: 'work' });
    expect(s.mirror.nextExerciseName).toBeUndefined();
  });

  it('pause freezes the clock at its reading, resume runs it again', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), rest(40_000), T0);
    s = advanceRunnerMirror(s, rest(37_000, { paused: true }), T0 + 3000);
    expect(s.mirror.paused).toBe(true);
    expect(s.mirror.timer).toMatchObject({ running: false, baseMs: 37_000 });
    const frozen = s.mirror.seq;
    expect(advanceRunnerMirror(s, rest(37_000, { paused: true }), T0 + 9000).mirror.seq).toBe(frozen); // still paused: quiet
    s = advanceRunnerMirror(s, rest(37_000), T0 + 10_000);
    expect(s.mirror.paused).toBe(false);
    expect(s.mirror.timer).toMatchObject({ running: true, baseMs: 37_000 });
  });

  it('pausing a reps set (no clock) still pauses', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    s = advanceRunnerMirror(s, snap({ paused: true }), T0 + 1);
    expect(s.mirror.paused).toBe(true);
    expect(s.mirror.timer.dir).toBe('none');
  });

  it('together flips the chip; late media updates without restarting the set', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), snap({ media: undefined }), T0);
    s = advanceRunnerMirror(s, snap({ setIndex: 2, media: undefined }), T0 + 1);
    s = advanceRunnerMirror(s, snap({ setIndex: 2, together: true, media: { imageUrl: 'https://cdn.example.com/a.jpg' } }), T0 + 2);
    expect(s.mirror.together).toBe(true);
    expect(s.mirror.media).toEqual({ imageUrl: 'https://cdn.example.com/a.jpg' });
    expect(s.mirror.setIndex).toBe(2);
  });

  it('done is final', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), snap(), T0);
    s = advanceRunnerMirror(s, snap({ phase: 'done' }), T0 + 1);
    expect(s.mirror.phase).toBe('done');
    expect(s.mirror.timer.dir).toBe('none');
  });

  it('a set index outside 1..setCount is clamped', () => {
    const s = advanceRunnerMirror(startRunnerMirror(T0), snap({ setIndex: 99 }), T0);
    expect(s.mirror.setIndex).toBe(4);
  });
});

describe('mirrorForWrite', () => {
  it('moves a running clock forward by the write delay, once per timer change', () => {
    const s = advanceRunnerMirror(startRunnerMirror(T0), rest(40_000), T0);
    const first = mirrorForWrite(s, T0 + 200, null);
    expect(first.mirror.timer.baseMs).toBe(39_800);
    // a later write of the same clock reuses the same timer object → the writer does not re-stamp it
    const second = mirrorForWrite({ ...s, mirror: { ...s.mirror, seq: s.mirror.seq + 1 } }, T0 + 900, first.written);
    expect(second.mirror.timer).toBe(first.mirror.timer);
    expect(timerChanged(first.mirror, second.mirror)).toBe(false);
  });
  it('a paused clock is not aged', () => {
    let s = advanceRunnerMirror(startRunnerMirror(T0), rest(40_000), T0);
    s = advanceRunnerMirror(s, rest(40_000, { paused: true }), T0);
    expect(mirrorForWrite(s, T0 + 5000, null).mirror.timer.baseMs).toBe(40_000);
  });
});
