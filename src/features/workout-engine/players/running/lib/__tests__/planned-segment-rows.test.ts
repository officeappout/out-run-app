import { describe, expect, it } from 'vitest';
import type { RunBlock } from '../../types/run-block.type';
import type { PlannedBlockRecord } from '../planned-rep-results';
import { lapTableRows, plannedRepRows, sectionStatus } from '../planned-segment-rows';

const rep = (id: string) => ({ id, type: 'interval', distanceMeters: 400 }) as unknown as RunBlock;
const blocks = [rep('a'), rep('b'), rep('c')];
const rec = (blockIndex: number, extra: Partial<PlannedBlockRecord>): PlannedBlockRecord =>
  ({ blockIndex, rep: blockIndex + 1, label: '', distanceMeters: 400, durationSeconds: 118, ...extra }) as PlannedBlockRecord;

describe('plannedRepRows', () => {
  const records = new Map<number, PlannedBlockRecord>([
    [0, rec(0, { avgPaceSec: 295, inRange: true, paceDeltaSec: 0 })],
    [1, rec(1, { avgPaceSec: 322, inRange: false, paceDeltaSec: 12 })],
  ]);
  const rows = plannedRepRows({
    blocks,
    indices: [0, 1, 2],
    reps: { byIndex: new Map([[0, 1], [1, 2], [2, 3]]) },
    records,
    currentBlockIndex: 2,
    focusIndex: 2,
    currentRemaining: '0:54',
  });
  it('a done rep shows km, time and its pace coloured by the target', () => {
    expect(rows[0]).toMatchObject({ n: 1, km: '0.40', time: '1:58', pace: '4:55', paceTone: 'in', current: false });
    expect(rows[1]).toMatchObject({ n: 2, pace: '5:22', paceTone: 'off' });
    expect(rows[1].paceNote).toBeTruthy();
  });
  it('the live rep carries the countdown and is current; no pace yet', () => {
    expect(rows[2]).toMatchObject({ n: 3, km: '–', time: '0:54', pace: null, paceTone: 'none', current: true });
  });
  it('a rep without a stored pace (under 400 m) shows no pace', () => {
    const r = plannedRepRows({
      blocks, indices: [0], reps: { byIndex: new Map() }, records: new Map([[0, rec(0, {})]]),
      currentBlockIndex: 1, focusIndex: 1, currentRemaining: '',
    });
    expect(r[0].pace).toBe(null);
    expect(r[0].n).toBe(1);
  });
});

describe('sectionStatus', () => {
  it('done behind the live block, now when it holds it, ahead otherwise', () => {
    expect(sectionStatus([0, 1], 3, 3)).toBe('done');
    expect(sectionStatus([2, 3, 4], 3, 3)).toBe('now');
    expect(sectionStatus([5], 3, 4)).toBe('ahead');
    expect(sectionStatus([4], 3, 4)).toBe('now');
    expect(sectionStatus([], 0, 0)).toBe('ahead');
  });
});

describe('lapTableRows', () => {
  it('maps lap rows 1:1, the live lap is current, no pace stays null', () => {
    const out = lapTableRows(
      [
        { id: 'l1', n: 1, distanceText: '1.00', timeText: '5:48', paceText: '5:48', active: false },
        { id: 'l2', n: 2, distanceText: '0.30', timeText: '1:50', paceText: null, active: true },
      ],
      (n, active) => (active ? `lap ${n} now` : `lap ${n}`),
    );
    expect(out[0]).toMatchObject({ key: 'l1', n: 1, name: 'lap 1', km: '1.00', time: '5:48', pace: '5:48', current: false });
    expect(out[1]).toMatchObject({ name: 'lap 2 now', pace: null, current: true });
  });
});
