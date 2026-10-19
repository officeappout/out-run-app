import { describe, it, expect } from 'vitest';
import { initTimed, reduceTimed, reduceTimedAll, syncTimed } from '../timed/timed-machine';
import { timedView, amrapScore } from '../timed/timed.selectors';
import { buildTabataIntervals, tabataTotalMs } from '../timed/tabata-schedule';
import { cuesBetween } from '../timed/timed-cues';
import { buildTimedResult, toStrengthSegmentRecord } from '../timed/timed-result';
import { createMonotonicNow } from '../clock';
import type { AmrapState, EmomState, TimedBlockSpec, TimedItem } from '../timed/timed.types';
import { stationRows } from '@/features/workout-engine/components/strength/utils/summary-v2.mapping';
import { hybridStationTables } from '@/features/workout-engine/summary/v2-summary.mapping';

const T0 = 1_000_000;
const ex = (key: string, targetReps = 10, extra: Partial<TimedItem> = {}): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetReps, ...extra });
const run = (distanceM: number): TimedItem => ({ kind: 'aerobic_leg', key: 'run-1', name: `ריצה ${distanceM} מ׳`, distanceM });

describe('clock', () => {
  it('never runs backwards', () => {
    const vals = [10, 20, 15, 30];
    const now = createMonotonicNow(() => vals.shift() as number);
    expect([now(), now(), now(), now()]).toEqual([10, 20, 20, 30]);
  });
});

describe('tabata', () => {
  const spec: TimedBlockSpec = { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 }, items: [ex('a'), ex('b')] };

  it('cycle-major order and no trailing rest (230 s)', () => {
    const ivs = buildTabataIntervals(spec.items, spec.config);
    expect(ivs.map((i) => i.itemIndex)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(tabataTotalMs(spec.config, 8)).toBe(230_000);
  });

  it('exercise-major and unilateral costs', () => {
    const em = buildTabataIntervals(spec.items, { ...spec.config, orderMode: 'exercise-major' });
    expect(em.map((i) => i.itemIndex)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const uni = buildTabataIntervals([ex('a', 10, { isUnilateral: true }), ex('b')], { workSec: 20, restSec: 10, rounds: 6 });
    expect(uni.map((i) => [i.itemIndex, i.side])).toEqual([[0, 'right'], [0, 'left'], [1, null], [0, 'right'], [0, 'left'], [1, null]]);
  });

  it('position is derived from timestamps (survives background)', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    // No ticks for 75 s (app in background) → interval 3 work, 15 s in.
    const v = timedView(s, T0 + 75_000);
    expect(v.phase).toBe('work');
    expect(v.round).toBe(3);
    expect(v.phaseRemainingMs).toBe(5_000);
    expect(v.isLastSeconds).toBe(true);
    s = reduceTimed(s, { type: 'TICK', atMs: T0 + 300_000 });
    expect(s.status).toBe('done');
    expect(s.clock.endedAtMs).toBe(T0 + 230_000);
  });

  it('pause freezes the clock', () => {
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'PAUSE', atMs: T0 + 5_000 },
      { type: 'RESUME', atMs: T0 + 65_000 },
    ]);
    expect(timedView(s, T0 + 70_000).activeMs).toBe(10_000);
  });

  it('result: seconds per interval, logged reps win', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'LOG_REPS', atMs: T0 + 21_000, reps: 12, index: 0 });
    s = reduceTimed(s, { type: 'FINISH', atMs: T0 + 40_000 }); // interval 1 (b) 10 s in
    const r = buildTimedResult(s);
    expect(r.outcome).toBe('stopped');
    expect(r.exerciseLog[0].confirmedReps).toEqual([12]);
    expect(r.exerciseLog[1].confirmedReps).toEqual([10]);
    expect(r.tabata).toEqual({ intervalsDone: 1, intervalsTotal: 8 });
  });
});

describe('emom', () => {
  const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 4 }, items: [ex('a', 8), ex('b', 6)] };

  it('done → rest of minute; no tap → missed; log turns missed into partial', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'ITEM_DONE', atMs: T0 + 39_000 });
    expect(timedView(s, T0 + 40_000).phase).toBe('rest');
    expect(timedView(s, T0 + 40_000).phaseRemainingMs).toBe(20_000);
    s = reduceTimed(s, { type: 'TICK', atMs: T0 + 125_000 }); // minute 2 passed untouched
    expect((s as EmomState).data.minutes[1].status).toBe('missed');
    s = reduceTimed(s, { type: 'LOG_REPS', atMs: T0 + 126_000, reps: 4, index: 1 });
    expect((s as EmomState).data.minutes[1].status).toBe('partial');
    s = reduceTimed(s, { type: 'TICK', atMs: T0 + 400_000 });
    expect(s.status).toBe('done');
    const r = buildTimedResult(s);
    expect(r.emom?.done).toBe(1);
    expect(r.exerciseLog.map((e) => e.confirmedReps)).toEqual([[8, 0], [4, 0]]);
    const rows = stationRows(r.exerciseLog);
    expect(rows[0].tiles.map((t) => t.tone)).toEqual(['in', 'missed']);
    expect(rows[1].tiles.map((t) => t.tone)).toEqual(['below', 'missed']);
  });

  it('a tap within the grace after rollover credits the previous minute', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'ITEM_DONE', atMs: T0 + 60_400 });
    expect((s as EmomState).data.minutes[0].status).toBe('done');
    expect((s as EmomState).data.minutes[1].status).toBe('pending');
  });

  it('last seconds flag and countdown cues', () => {
    const s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    expect(timedView(s, T0 + 56_000).isLastSeconds).toBe(true);
    expect(timedView(s, T0 + 54_000).isLastSeconds).toBe(false);
    const cues = [];
    for (let t = 56_600; t <= 60_000; t += 200) cues.push(...cuesBetween(s, t - 200, t)); // display frames
    expect(cues.map((c) => c.type)).toEqual(['countdown', 'countdown', 'countdown', 'minute_start']);
  });

  it('drops stale cues after a background gap', () => {
    const s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    const cues = cuesBetween(s, 0, 150_000);
    expect(cues.filter((c) => c.type === 'countdown')).toHaveLength(0);
    expect(cues.filter((c) => c.type === 'minute_start')).toHaveLength(1);
  });
});

describe('amrap', () => {
  const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [ex('a', 10), ex('b', 5)] };

  it('rounds, cap → partial reps of the current item only, score', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    const taps = [60, 120, 190, 250, 320]; // a,b | a,b | a
    for (const t of taps) s = reduceTimed(s, { type: 'ITEM_DONE', atMs: T0 + t * 1000 });
    expect(timedView(s, T0 + 330_000).round).toBe(3);
    s = reduceTimed(s, { type: 'TICK', atMs: T0 + 601_000 });
    expect(s.status).toBe('awaiting_partial');
    expect(timedView(s, T0 + 700_000).activeMs).toBe(600_000);
    s = reduceTimed(s, { type: 'LOG_REPS', atMs: T0 + 610_000, reps: 3 });
    expect(s.status).toBe('done');
    const score = amrapScore(s as AmrapState);
    expect(score).toMatchObject({ fullRounds: 2, extraReps: 13, extraItems: 2 });
    const r = buildTimedResult(s);
    expect(r.outcome).toBe('completed');
    expect(r.exerciseLog.map((e) => e.confirmedReps)).toEqual([[10, 10, 10], [5, 5, 3]]);
    expect(r.amrap?.rounds.map((x) => x.durationSec)).toEqual([120, 130, 350]);
  });

  it('a run inside the round hands off by GPS; no pace under 400 m', () => {
    const rs: TimedBlockSpec = { format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [run(300), ex('sq', 10)] };
    let s = reduceTimed(initTimed(rs), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'AEROBIC_PROGRESS', atMs: T0 + 40_000, distanceM: 150 });
    expect(timedView(s, T0 + 40_000).phase).toBe('aerobic');
    s = reduceTimed(s, { type: 'AEROBIC_PROGRESS', atMs: T0 + 80_000, distanceM: 305 });
    expect(timedView(s, T0 + 80_000).current?.key).toBe('sq');
    s = reduceTimed(s, { type: 'FINISH', atMs: T0 + 100_000 });
    s = reduceTimed(s, { type: 'LOG_REPS', atMs: T0 + 101_000, reps: 6 });
    const r = buildTimedResult(s);
    expect(r.aerobicLegs[0].result).toEqual({ completed: true, actualDistanceM: 305, actualDurationSec: 80 });
    expect(r.exerciseLog[0]).toMatchObject({ exerciseId: 'run-1', confirmedReps: [80], repsSource: ['timer'] });
  });

  it('cap during a run closes it with the distance covered', () => {
    const rs: TimedBlockSpec = { format: 'amrap', config: { capSec: 60, roundItems: [] }, items: [run(1000)] };
    let s = reduceTimed(initTimed(rs), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'AEROBIC_PROGRESS', atMs: T0 + 50_000, distanceM: 200 });
    s = syncTimed(s, T0 + 61_000);
    expect(s.status).toBe('done');
    expect(buildTimedResult(s).aerobicLegs[0].result).toMatchObject({ completed: false, actualDistanceM: 200 });
  });

  it('result is a strength record the hybrid summary reads', () => {
    let s = reduceTimed(initTimed(spec), { type: 'START', atMs: T0 });
    s = reduceTimed(s, { type: 'ITEM_DONE', atMs: T0 + 30_000, reps: 12 });
    s = reduceTimed(s, { type: 'FINISH', atMs: T0 + 40_000 });
    s = reduceTimed(s, { type: 'FINISH', atMs: T0 + 41_000 }); // skip partial
    const rec = toStrengthSegmentRecord(buildTimedResult(s), 1, 'AMRAP');
    expect(rec.actual?.sets).toBe(1);
    expect(hybridStationTables([rec])[0].rows[0].tiles[0].value).toBe('12');
  });

  it('empty block finishes at start', () => {
    const s = reduceTimed(initTimed({ format: 'amrap', config: { capSec: 60, roundItems: [] }, items: [] }), { type: 'START', atMs: T0 });
    expect(s.status).toBe('done');
  });
});
