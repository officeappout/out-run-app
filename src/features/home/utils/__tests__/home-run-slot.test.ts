import { describe, it, expect } from 'vitest';
import {
  isQualityRunEntry,
  nextRunDayHint,
  placeRunCard,
  resolveHomeRunSlot,
  type HomeRunEntry,
} from '../home-run-slot';

const easy: HomeRunEntry = { week: 2, day: 1, status: 'pending', workoutId: 'easy_w2', category: 'easy_run' };
const tempo: HomeRunEntry = { week: 2, day: 2, status: 'pending', workoutId: 'tempo_w2', category: 'tempo' };
const long: HomeRunEntry = { week: 2, day: 3, status: 'pending', workoutId: 'long_w2', category: 'long_run' };

const runDay = (todayEntry: HomeRunEntry | undefined, nextEntry?: HomeRunEntry, nextEntryDaysAway?: number) => ({
  isRunDay: true, todayEntry, nextEntry, nextEntryDaysAway,
});
const restDay = (nextEntry?: HomeRunEntry, nextEntryDaysAway?: number) => ({
  isRunDay: false, todayEntry: undefined, nextEntry, nextEntryDaysAway,
});

describe('resolveHomeRunSlot', () => {
  it('is null with the flag off (legacy home unchanged)', () => {
    expect(resolveHomeRunSlot({ enabled: false, hasRunningPlan: true, hasStrengthProgram: false, dayState: runDay(easy) })).toBeNull();
  });

  it('is null without a running plan', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: false, hasStrengthProgram: true, dayState: runDay(easy) })).toBeNull();
  });

  it('running-only, run day → today, first', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: false, dayState: runDay(easy) }))
      .toEqual({ kind: 'today', entry: easy, position: 'first' });
  });

  it('running-only, rest day → the next run, first, with its distance in days', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: false, dayState: restDay(tempo, 2) }))
      .toEqual({ kind: 'next', entry: tempo, daysAway: 2, position: 'first' });
  });

  it('both tracks, quality run today → run before strength (R3)', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: true, dayState: runDay(tempo) })?.position)
      .toBe('first');
  });

  it('both tracks, easy or long run today → after the first strength card', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: true, dayState: runDay(easy) })?.position)
      .toBe('afterFirst');
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: true, dayState: runDay(long) })?.position)
      .toBe('afterFirst');
  });

  it('both tracks, rest-from-running day → next run, last', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: true, dayState: restDay(easy, 1) }))
      .toEqual({ kind: 'next', entry: easy, daysAway: 1, position: 'last' });
  });

  it("today's run already done or skipped → falls through to the next run", () => {
    const done = { ...easy, status: 'completed' as const };
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: false, dayState: runDay(done, tempo, 2) }))
      .toMatchObject({ kind: 'next', entry: tempo });
    const skipped = { ...easy, status: 'skipped' as const };
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: false, dayState: runDay(skipped) }))
      .toBeNull();
  });

  it('nothing pending this week → no card', () => {
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: false, dayState: restDay(undefined) })).toBeNull();
    const doneNext = { ...tempo, status: 'completed' as const };
    expect(resolveHomeRunSlot({ enabled: true, hasRunningPlan: true, hasStrengthProgram: true, dayState: restDay(doneNext, 1) })).toBeNull();
  });
});

describe('isQualityRunEntry (weaver rule)', () => {
  it('slotType wins, then isQualityWorkout, then category', () => {
    expect(isQualityRunEntry({ ...easy, slotType: 'quality_primary' })).toBe(true);
    expect(isQualityRunEntry({ ...tempo, slotType: 'easy_run' })).toBe(false);
    expect(isQualityRunEntry({ ...easy, isQualityWorkout: true })).toBe(true);
    expect(isQualityRunEntry(tempo)).toBe(true);
    expect(isQualityRunEntry(long)).toBe(false);
    expect(isQualityRunEntry({ week: 1, day: 1 })).toBe(false);
  });
});

describe('placeRunCard', () => {
  const items = ['invite', 'strength', 'steps'];
  it('first / afterFirst / last', () => {
    expect(placeRunCard(items, 'run', 'first')).toEqual(['run', 'invite', 'strength', 'steps']);
    expect(placeRunCard(items, 'run', 'afterFirst')).toEqual(['invite', 'run', 'strength', 'steps']);
    expect(placeRunCard(items, 'run', 'last')).toEqual(['invite', 'strength', 'steps', 'run']);
  });
  it('empty list → just the run', () => {
    expect(placeRunCard([], 'run', 'afterFirst')).toEqual(['run']);
    expect(placeRunCard([], 'run', 'last')).toEqual(['run']);
  });
});

describe('nextRunDayHint', () => {
  it('מחר / בעוד N ימים / הבא', () => {
    expect(nextRunDayHint(1)).toBe('מחר');
    expect(nextRunDayHint(3)).toBe('בעוד 3 ימים');
    expect(nextRunDayHint(undefined)).toBe('הבא');
  });
});
