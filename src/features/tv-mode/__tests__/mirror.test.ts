import { describe, expect, it } from 'vitest';
import { formatClock } from '../core/format';
import { initialMirror, mirrorReducer, newerMirror, NO_TIMER, timerChanged, timerProgress, timerReading } from '../core/mirror';
import type { TvMirror, TvTimer } from '../core/types';

const down = (baseMs: number, running = true, totalMs = 30_000): TvTimer => ({ dir: 'down', baseMs, running, totalMs });

const started = (): TvMirror =>
  mirrorReducer(initialMirror(), { type: 'exercise', index: 2, count: 5, name: 'מתח רחב', next: 'מקבילים', setCount: 5, repsMin: 8, repsMax: 12 });

describe('mirrorReducer', () => {
  it('a new exercise resets set + timer and bumps seq', () => {
    const m = started();
    expect(m).toMatchObject({ phase: 'work', exerciseIndex: 2, exerciseCount: 5, setIndex: 1, setCount: 5, paused: false, seq: 1 });
    expect(m.timer).toEqual(NO_TIMER);
  });
  it('clamps the set into 1..setCount', () => {
    const m = started();
    expect(mirrorReducer(m, { type: 'set', setIndex: 9 }).setIndex).toBe(5);
    expect(mirrorReducer(m, { type: 'set', setIndex: 0 }).setIndex).toBe(1);
  });
  it('pause freezes the reading, resume restarts the same base', () => {
    let m = mirrorReducer(started(), { type: 'phase', phase: 'work', timer: down(30_000) });
    m = mirrorReducer(m, { type: 'pause', readingMs: 12_345 });
    expect(m.paused).toBe(true);
    expect(m.timer).toMatchObject({ baseMs: 12_345, running: false });
    m = mirrorReducer(m, { type: 'resume' });
    expect(m.paused).toBe(false);
    expect(m.timer).toMatchObject({ baseMs: 12_345, running: true });
  });
  it('pause twice / resume when not paused change nothing (no seq churn)', () => {
    const m = mirrorReducer(started(), { type: 'pause', readingMs: 1 });
    expect(mirrorReducer(m, { type: 'pause', readingMs: 2 })).toBe(m);
    const r = started();
    expect(mirrorReducer(r, { type: 'resume' })).toBe(r);
  });
  it('resume keeps a no-timer exercise without a clock', () => {
    const paused = mirrorReducer(started(), { type: 'pause', readingMs: 0 });
    const m = mirrorReducer(paused, { type: 'resume' });
    expect(m.timer.dir).toBe('none');
  });
  it('done stops everything', () => {
    const m = mirrorReducer(started(), { type: 'done' });
    expect(m).toMatchObject({ phase: 'done', paused: false });
    expect(m.timer).toEqual(NO_TIMER);
  });
  it('together is idempotent', () => {
    const m = started();
    expect(mirrorReducer(m, { type: 'together', together: false })).toBe(m);
    expect(mirrorReducer(m, { type: 'together', together: true }).together).toBe(true);
  });
});

describe('timerReading', () => {
  it('counts down from the server anchor and floors at 0', () => {
    expect(timerReading(down(30_000), 1_000, 11_000)).toBe(20_000);
    expect(timerReading(down(30_000), 1_000, 99_000)).toBe(0);
  });
  it('counts up', () => {
    expect(timerReading({ dir: 'up', baseMs: 5_000, running: true, totalMs: 0 }, 0, 7_000)).toBe(12_000);
  });
  it('a paused or unanchored clock does not move', () => {
    expect(timerReading(down(30_000, false), 1_000, 50_000)).toBe(30_000);
    expect(timerReading(down(30_000), null, 50_000)).toBe(30_000);
  });
  it('a clock ahead of the anchor never reads negative elapsed', () => {
    expect(timerReading(down(30_000), 5_000, 1_000)).toBe(30_000);
  });
  it('no timer reads 0', () => {
    expect(timerReading(NO_TIMER, 0, 10)).toBe(0);
  });
  it('progress is 0..1 in both directions', () => {
    expect(timerProgress(down(30_000), 15_000)).toBe(0.5);
    expect(timerProgress({ dir: 'up', baseMs: 0, running: true, totalMs: 60_000 }, 15_000)).toBe(0.25);
    expect(timerProgress(down(30_000), -5)).toBe(1);
    expect(timerProgress(NO_TIMER, 5)).toBe(0);
  });
});

describe('writer helpers', () => {
  it('re-stamps the anchor only when the clock itself changed', () => {
    const a = mirrorReducer(started(), { type: 'phase', phase: 'work', timer: down(30_000) });
    const sameClock = mirrorReducer(a, { type: 'set', setIndex: 2 });
    expect(timerChanged(a, sameClock)).toBe(false);
    expect(timerChanged(a, mirrorReducer(a, { type: 'pause', readingMs: 9_000 }))).toBe(true);
    expect(timerChanged(null, a)).toBe(true);
  });
  it('a late snapshot never wins', () => {
    const newer = mirrorReducer(started(), { type: 'set', setIndex: 3 });
    const older = started();
    expect(newerMirror(newer, older)).toBe(newer);
    expect(newerMirror(older, newer)).toBe(newer);
    expect(newerMirror(newer, null)).toBe(newer);
  });
});

describe('formatClock', () => {
  it('m:ss, Latin digits, no wrap at 60 minutes', () => {
    expect(formatClock(42_000)).toBe('0:42');
    expect(formatClock(61_999)).toBe('1:01');
    expect(formatClock(3_725_000)).toBe('62:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});
