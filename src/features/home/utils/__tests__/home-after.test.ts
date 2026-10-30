import { describe, it, expect } from 'vitest';
import { composeHomeAfterSlides, isHomeAfterActive, runTodayStillDue, HOME_AFTER_DONE_ID } from '../home-after';

type S = { id: string; topUp?: boolean };
const compose = (remaining: S[], runToday: S | null, done: S | null, tail: S[] = []) =>
  composeHomeAfterSlides<S>({ remaining, planned: runToday ? [runToday] : [], tail, done, isTopUp: (s) => !!s.topUp, idOf: (s) => s.id }).map((s) => s.id);

const done: S = { id: HOME_AFTER_DONE_ID };
const run: S = { id: 'run-plan-card' };

describe('isHomeAfterActive', () => {
  const on = { flag: true, v2: true, isToday: true, workoutDone: true };
  it('needs the flag, home v2, today and a done workout', () => {
    expect(isHomeAfterActive(on)).toBe(true);
    expect(isHomeAfterActive({ ...on, flag: false })).toBe(false);
    expect(isHomeAfterActive({ ...on, v2: false })).toBe(false);
    expect(isHomeAfterActive({ ...on, isToday: false })).toBe(false);
    expect(isHomeAfterActive({ ...on, workoutDone: false })).toBe(false);
  });
});

describe('runTodayStillDue', () => {
  it('only a run planned for today that was not skipped', () => {
    expect(runTodayStillDue({ kind: 'today' })).toBe(true);
    expect(runTodayStillDue({ kind: 'today', skippedToday: true })).toBe(false);
    expect(runTodayStillDue({ kind: 'next' })).toBe(false);
    expect(runTodayStillDue(null)).toBe(false);
  });
});

describe('composeHomeAfterSlides', () => {
  it('remaining first, done last', () => {
    expect(compose([{ id: 'recovery' }, { id: 'steps' }], null, done)).toEqual(['recovery', 'steps', HOME_AFTER_DONE_ID]);
  });

  it('top-up, then today\'s run, then the rest', () => {
    expect(compose([{ id: 'recovery' }, { id: 'topup', topUp: true }, { id: 'steps' }], run, done))
      .toEqual(['topup', 'run-plan-card', 'recovery', 'steps', HOME_AFTER_DONE_ID]);
  });

  it('never places the run twice', () => {
    expect(compose([run, { id: 'steps' }], run, done)).toEqual(['run-plan-card', 'steps', HOME_AFTER_DONE_ID]);
  });

  it('the short walk goes after the engine\'s cards, before done', () => {
    expect(compose([{ id: 'recovery' }], run, done, [{ id: 'walk-card' }]))
      .toEqual(['run-plan-card', 'recovery', 'walk-card', HOME_AFTER_DONE_ID]);
  });

  it('nothing left: only the done slide', () => {
    expect(compose([], null, done)).toEqual([HOME_AFTER_DONE_ID]);
  });

  it('no done slide when nothing is done', () => {
    expect(compose([{ id: 'steps' }], run, null)).toEqual(['run-plan-card', 'steps']);
  });
});
