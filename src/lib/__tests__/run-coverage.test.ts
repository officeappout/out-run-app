import { describe, expect, it } from 'vitest';
import {
  RUN_COVERAGE,
  classifyRunDoc,
  isDiscardableRun,
  plannedRunDoneToday,
  plannedTargetOfBlocks,
  runCountsTowardWeek,
  type RunCoverageDoc,
} from '../run-coverage';

const ENTRY = { week: 2, day: 3 };
const TARGET = { durationSec: 2400, distanceKm: 5 }; // a 40 min / 5 km plan
const run = (over: Partial<RunCoverageDoc> = {}): RunCoverageDoc => ({
  id: 'r1', workoutType: 'running', activityType: 'running', duration: 0, distance: 0, ...over,
});
const planned = (over: Partial<RunCoverageDoc> = {}): RunCoverageDoc =>
  run({ runMeta: { plan: { week: 2, day: 3 }, target: TARGET }, ...over });

describe('constants', () => {
  it('are the owner numbers (23.10.2026)', () => {
    expect(RUN_COVERAGE.PLANNED_DONE_RATIO).toBe(0.7);
    expect(RUN_COVERAGE.COVER_MIN_SEC).toBe(600);
    expect(RUN_COVERAGE.COVER_RATIO).toBe(0.5);
  });
});

describe('isDiscardableRun (the unchanged save rule)', () => {
  it('under 60 s AND under 100 m is discarded', () => expect(isDiscardableRun(59, 0.099)).toBe(true));
  it('60 s or 100 m is saved', () => {
    expect(isDiscardableRun(60, 0)).toBe(false);
    expect(isDiscardableRun(10, 0.1)).toBe(false);
  });
});

describe('plannedTargetOfBlocks', () => {
  it('sums time and km; null when nothing planned', () => {
    expect(plannedTargetOfBlocks([{ durationSeconds: 300 }, { durationSeconds: 1500, distanceMeters: 3000 }]))
      .toEqual({ durationSec: 1800, distanceKm: 3 });
    expect(plannedTargetOfBlocks([{}])).toBeNull();
    expect(plannedTargetOfBlocks(undefined)).toBeNull();
  });
});

describe('plannedRunDoneToday', () => {
  it('no run docs → none', () => {
    expect(plannedRunDoneToday(ENTRY, [], TARGET).state).toBe('none');
    expect(plannedRunDoneToday(ENTRY, [{ id: 's', workoutType: 'strength', duration: 3000 }], TARGET).state).toBe('none');
    expect(plannedRunDoneToday(null, [planned({ duration: 2400 })]).state).toBe('none');
  });

  it('(a) the planned run at >= 70% of its time or km is done (plan coverage)', () => {
    expect(plannedRunDoneToday(ENTRY, [planned({ duration: 1680, distance: 2 })])).toEqual({ state: 'done', workoutId: 'r1', coverage: 'plan' });
    // by km alone
    expect(plannedRunDoneToday(ENTRY, [planned({ duration: 900, distance: 3.6 })]).state).toBe('done');
  });

  it('69% of the plan is not done; with >= 10 min and >= 50% it covers the slot instead', () => {
    const r = plannedRunDoneToday(ENTRY, [planned({ duration: 1650, distance: 3.4 })]);
    expect(r).toEqual({ state: 'covered', workoutId: 'r1', coverage: 'free' });
  });

  it('(b) a free run of >= 10 min and >= 50% covers', () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 1200, distance: 2.5 })], TARGET))
      .toEqual({ state: 'covered', workoutId: 'r1', coverage: 'free' });
    // 50% of the km but under 10 min does not
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 500, distance: 2.6 })], TARGET).state).toBe('partial');
    // >= 10 min but under 50% does not
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 700, distance: 1.2 })], TARGET).state).toBe('partial');
  });

  it("the owner's 0.1 km / 1 min test run is partial", () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 60, distance: 0.1 })], TARGET)).toEqual({ state: 'partial' });
  });

  it('a free run is never "done" even at 100% (only the planned run completes the plan)', () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 2400, distance: 5 })], TARGET).coverage).toBe('free');
  });

  it("a planned doc for ANOTHER entry is just a run: judged as free coverage", () => {
    const other = run({ duration: 2400, distance: 5, runMeta: { plan: { week: 2, day: 1 }, target: TARGET } });
    expect(plannedRunDoneToday(ENTRY, [other], TARGET)).toMatchObject({ state: 'covered', coverage: 'free' });
  });

  it('the best of several runs wins (a test tap then the real run)', () => {
    const r = plannedRunDoneToday(ENTRY, [run({ id: 'tap', duration: 60, distance: 0.1 }), planned({ id: 'real', duration: 2300, distance: 4.8 })]);
    expect(r).toEqual({ state: 'done', workoutId: 'real', coverage: 'plan' });
  });

  it('unknown target: only a long run (>= 20 min) counts', () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 1500 })]).state).toBe('covered');
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 900 })]).state).toBe('partial');
    expect(classifyRunDoc(run({ duration: 1500 }), null, true)).toBe('done');
  });

  it('walks, rides and combined workouts are not runs here', () => {
    expect(plannedRunDoneToday(ENTRY, [{ id: 'w', workoutType: 'walking', duration: 3000, distance: 4 }], TARGET).state).toBe('none');
    expect(plannedRunDoneToday(ENTRY, [{ id: 'h', workoutType: 'hybrid', activityType: 'hybrid', duration: 3000 }], TARGET).state).toBe('none');
  });
});

describe('beginner plans (owner 23.10.2026)', () => {
  it('a shorter run never covers the slot; the planned run still completes it', () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 1500, distance: 3 })], TARGET, { beginner: true }).state).toBe('partial');
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 1500 })], null, { beginner: true }).state).toBe('partial');
    expect(plannedRunDoneToday(ENTRY, [planned({ duration: 1700, distance: 2 })], TARGET, { beginner: true }).state).toBe('done');
  });
});

describe('coverageTarget (a free run stamped with its matched plan target)', () => {
  it('is used for a free run when home has not loaded the plan target', () => {
    expect(plannedRunDoneToday(ENTRY, [run({ duration: 1300, distance: 2.6, runMeta: { coverageTarget: TARGET } })]).state).toBe('covered');
  });
});

describe('runCountsTowardWeek', () => {
  it('same 50%-of-plan test when the matched target is known', () => {
    expect(runCountsTowardWeek(run({ duration: 720, distance: 1.5, runMeta: { coverageTarget: TARGET } }))).toBe(false); // 12 of 40 min
    expect(runCountsTowardWeek(run({ duration: 1300, distance: 2.6, runMeta: { coverageTarget: TARGET } }))).toBe(true);
    expect(runCountsTowardWeek(planned({ duration: 1300, distance: 2.6 }))).toBe(true); // planned, covering
    expect(runCountsTowardWeek(planned({ duration: 720, distance: 1.5 }))).toBe(false);
  });
  it('no target: a plain run counts from 10 min', () => {
    expect(runCountsTowardWeek(run({ duration: 60, distance: 0.1 }))).toBe(false);
    expect(runCountsTowardWeek(run({ duration: 599 }))).toBe(false);
    expect(runCountsTowardWeek(run({ duration: 600 }))).toBe(true);
  });
  it('a planned run that reached its own (short) target counts', () => {
    expect(runCountsTowardWeek(run({ duration: 400, distance: 1, runMeta: { plan: { week: 1, day: 1 }, target: { durationSec: 480 } } }))).toBe(true);
  });
  it('combined and other docs are unchanged', () => {
    expect(runCountsTowardWeek({ workoutType: 'hybrid', activityType: 'hybrid', duration: 30 })).toBe(true);
  });
});
