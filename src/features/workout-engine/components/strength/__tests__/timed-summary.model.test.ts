import { describe, it, expect } from 'vitest';
import { initTimed, reduceTimedAll } from '@/features/workout-engine/engines/timed/timed-machine';
import { buildTimedResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { TimedBlockSpec, TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import { amrapSummaryModel, emomSummaryModel, roundOrdinal, tabataSummaryLine } from '../utils/timed-summary.model';

const T0 = 1_000_000;
const ex = (key: string, targetReps: number): TimedItem => ({ kind: 'exercise', key, exerciseId: key, name: key, targetReps });

describe('timed summary cards (A-2f / A-4f)', () => {
  it('AMRAP: full rounds, the extra reps line, round tiles, the partial tile', () => {
    const spec: TimedBlockSpec = { format: 'amrap', config: { capSec: 600, roundItems: [] }, items: [ex('a', 12), ex('b', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 70_000 },
      { type: 'ITEM_DONE', atMs: T0 + 151_000 },
      { type: 'ITEM_DONE', atMs: T0 + 230_000 },
      { type: 'TICK', atMs: T0 + 600_000 },
      { type: 'LOG_REPS', atMs: T0 + 601_000, reps: 4 },
    ]);
    const m = amrapSummaryModel(buildTimedResult(s))!;
    expect(m.title).toBe('AMRAP 10′');
    expect(m.fullRounds).toBe(1);
    expect(m.extraLine).toBe('ועוד 16 חזרות בסבב השני');
    expect(m.rounds).toEqual([{ key: 'r0', label: 'סבב 1', time: '2:31' }]);
    expect(m.partial).toEqual({ label: '16/22', fraction: 16 / 22 });
    expect(roundOrdinal(14)).toBe('בסבב ה-14');
  });

  it('EMOM: minutes on time, averages, bars by tone', () => {
    const spec: TimedBlockSpec = { format: 'emom', config: { intervalSec: 60, totalIntervals: 3 }, items: [ex('a', 12), ex('b', 10)] };
    const s = reduceTimedAll(initTimed(spec), [
      { type: 'START', atMs: T0 },
      { type: 'ITEM_DONE', atMs: T0 + 40_000 },
      { type: 'LOG_REPS', atMs: T0 + 119_000, reps: 8, index: 1 },
      { type: 'TICK', atMs: T0 + 181_000 },
    ]);
    const m = emomSummaryModel(buildTimedResult(s))!;
    expect(m.doneLabel).toBe('1/3');
    expect(m.percent).toBe(33);
    expect(m.totalReps).toBe(20);
    expect(m.avgWork).toBe('0:40');
    expect(m.avgRest).toBe('0:20');
    expect(m.bars.map((b) => b.tone)).toEqual(['done', 'partial', 'missed']);
    expect(m.note).toBe('דקה 2 (כתום): 8 מתוך 10 חזרות');
    expect(amrapSummaryModel(buildTimedResult(s))).toBeNull();
  });

  it('tabata line', () => {
    const spec: TimedBlockSpec = { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 2 }, items: [ex('a', 0)] };
    const s = reduceTimedAll(initTimed(spec), [{ type: 'START', atMs: T0 }, { type: 'TICK', atMs: T0 + 60_000 }]);
    expect(tabataSummaryLine(buildTimedResult(s))).toBe('2/2 אינטרוולים');
  });
});
