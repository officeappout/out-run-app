import { describe, it, expect } from 'vitest';
import { initTimed, reduceTimedAll } from '../timed/timed-machine';
import { buildTimedResult } from '../timed/timed-result';
import { parseTimedBlockRecords, toTimedBlockRecord, TIMED_RECORD_MAX_MINUTES, TIMED_RECORD_MAX_BLOCKS } from '../timed/timed-record';
import type { TimedBlockSpec, TimedItem } from '../timed/timed.types';
import { workoutHistoryEntryToStrengthSummaryProps } from '../../components/strength/strength-history-adapter';

const T0 = 1_000_000;
const ex = (key: string, targetReps: number): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetReps });

describe('timed-record (doc field `timedBlocks`)', () => {
  it('AMRAP → compact record, round-trips through the parser', () => {
    const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 300, roundItems: [] }, items: [ex('a', 12), ex('b', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 60_000 },
      { type: 'ITEM_DONE', atMs: T0 + 130_000 },
      { type: 'TICK', atMs: T0 + 300_000 },
      { type: 'LOG_REPS', atMs: T0 + 301_000, reps: 5 },
    ]);
    const r = toTimedBlockRecord('seg-main', buildTimedResult(s));
    expect(r).toEqual({
      protocol: 'amrap', segmentId: 'seg-main', plannedSec: 300, activeSec: 300,
      amrap: { fullRounds: 1, partialReps: 5, partialTarget: 22, roundTimesSec: [130] },
    });
    // Firestore-safe: no undefined anywhere.
    expect(JSON.stringify(r)).not.toContain('undefined');
    expect(parseTimedBlockRecords(JSON.parse(JSON.stringify([r])))).toEqual([r]);
  });

  it('EMOM minutes: status / reps / workSec, target only on partial', () => {
    const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 3 }, items: [ex('a', 12), ex('b', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 40_000 },
      { type: 'LOG_REPS', atMs: T0 + 119_000, reps: 8, index: 1 },
      { type: 'TICK', atMs: T0 + 181_000 },
    ]);
    expect(toTimedBlockRecord('e', buildTimedResult(s)).emom!.minutes).toEqual([
      { status: 'done', reps: 12, workSec: 40 },
      { status: 'partial', reps: 8, workSec: null, target: 10 },
      { status: 'missed', reps: null, workSec: null },
    ]);
  });

  it('parser drops junk and caps arrays (bounded doc size)', () => {
    const many = Array.from({ length: 200 }, () => ({ status: 'done', reps: 1, workSec: 30 }));
    const raw = [
      { protocol: 'emom', segmentId: 's', plannedSec: 60, activeSec: 60, emom: { minutes: many } },
      { protocol: 'nope' },
      null,
      ...Array.from({ length: 20 }, () => ({ protocol: 'tabata', tabata: { intervals: 8, intervalsTotal: 8 } })),
    ];
    const out = parseTimedBlockRecords(raw);
    expect(out.length).toBeLessThanOrEqual(TIMED_RECORD_MAX_BLOCKS);
    expect(out[0].emom!.minutes).toHaveLength(TIMED_RECORD_MAX_MINUTES);
    expect(parseTimedBlockRecords('x')).toEqual([]);
  });

  it('history adapter passes the records to the summary; old docs unchanged', () => {
    const base = { userId: 'u', activityType: 'strength', distance: 0, duration: 600, calories: 0, pace: 0, earnedCoins: 0, segments: [] } as never;
    expect('savedTimedBlocks' in workoutHistoryEntryToStrengthSummaryProps(base)).toBe(false);
    const withBlocks = { ...(base as object), timedBlocks: [{ protocol: 'tabata', segmentId: 't', plannedSec: 230, activeSec: 230, tabata: { intervals: 8, intervalsTotal: 8 } }] } as never;
    expect(workoutHistoryEntryToStrengthSummaryProps(withBlocks).savedTimedBlocks).toEqual([
      { protocol: 'tabata', segmentId: 't', plannedSec: 230, activeSec: 230, tabata: { intervals: 8, intervalsTotal: 8 } },
    ]);
  });
});
