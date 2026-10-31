import { describe, it, expect } from 'vitest';
import { composeHomeAfterSlides, isDoneFirst, DONE_FIRST_MS, isHomeAfterActive, runTodayStillDue, homeAfterDoneSlideId, isHomeAfterDoneSlideId, HOME_AFTER_DONE_ID } from '../home-after';

type S = { id: string; topUp?: boolean };
const compose = (remaining: S[], runToday: S | null, done: S | null, tail: S[] = []) =>
  composeHomeAfterSlides<S>({ remaining, planned: runToday ? [runToday] : [], tail, done: done ? [done] : [], isTopUp: (s) => !!s.topUp, idOf: (s) => s.id }).map((s) => s.id);

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

describe('done slides (stage 3)', () => {
  it('one per finished workout, last, in order', () => {
    const d = (k: string): S => ({ id: homeAfterDoneSlideId(k) });
    const ids = composeHomeAfterSlides<S>({ remaining: [{ id: 'steps' }], planned: [], done: [d('w1'), d('w2')], isTopUp: () => false, idOf: (s) => s.id }).map((s) => s.id);
    expect(ids).toEqual(['steps', 'home-after-done:w1', 'home-after-done:w2']);
    expect(ids.filter(isHomeAfterDoneSlideId)).toHaveLength(2);
    expect(isHomeAfterDoneSlideId('steps')).toBe(false);
  });
});

describe('done first right after a workout (boards HomeAfterB / Short, owner 31.10.2026)', () => {
  const run = (doneFirst: boolean) => composeHomeAfterSlides<S>({
    remaining: [{ id: 'top', topUp: true }, { id: 'steps' }], planned: [{ id: 'run' }], done: [done], isTopUp: (s) => !!s.topUp, idOf: (s) => s.id, doneFirst,
  }).map((s) => s.id);
  it('leads while doneFirst, what is left follows in the usual order', () => {
    expect(run(true)).toEqual([HOME_AFTER_DONE_ID, 'top', 'run', 'steps']);
    expect(run(false)).toEqual(['top', 'run', 'steps', HOME_AFTER_DONE_ID]);
  });
  it('the window: a workout finished less than DONE_FIRST_MS ago', () => {
    const t0 = Date.parse('2026-10-31T10:00:00Z');
    const at = new Date(t0).toISOString();
    expect(isDoneFirst(at, t0 + 60_000)).toBe(true);
    expect(isDoneFirst(at, t0 + DONE_FIRST_MS)).toBe(false);
    expect(isDoneFirst(null, t0)).toBe(false);
    expect(isDoneFirst('garbage', t0)).toBe(false);
  });
});
