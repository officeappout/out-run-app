import { describe, expect, it } from 'vitest';
import type { SessionSegmentRecord } from '@/features/workout-engine/core/services/storage.service';
import { aerobicRings, hybridRings, hybridStationTables, paceLabel, repTableModel, timeLabel } from '../v2-summary.mapping';

describe('paceLabel / timeLabel', () => {
  it('formats and guards', () => {
    expect(paceLabel(4.87)).toBe('4:52');
    expect(paceLabel(4.999)).toBe('5:00');
    expect(paceLabel(0)).toBe('--');
    expect(timeLabel(2538)).toBe('42:18');
    expect(timeLabel(3725)).toBe('1:02:05');
    expect(timeLabel(0)).toBe('--');
  });
});

describe('aerobicRings', () => {
  it('distance · pace · time, closed rings when there is a value', () => {
    const r = aerobicRings({ distance: 6.5, pace: 4.87, duration: 2538 });
    expect(r.map((x) => [x.key, x.value, x.pct])).toEqual([
      ['distance', '6.50', 100],
      ['pace', '4:52', 100],
      ['time', '42:18', 100],
    ]);
  });
  it('empty rings when nothing was recorded', () => {
    expect(aerobicRings({}).map((x) => x.pct)).toEqual([0, 0, 0]);
  });
});

const segments: SessionSegmentRecord[] = [
  { index: 0, kind: 'aerobic', planned: { distanceKm: 2 }, actual: { distanceKm: 1.9 } },
  {
    index: 1,
    kind: 'strength',
    planned: { sets: 8 },
    actual: {
      sets: 7,
      exerciseLog: [{ exerciseId: 'pu', exerciseName: 'מתח', confirmedReps: [7, 6], targetReps: 8, prescribedRange: { min: 6, max: 8 } }],
    },
  },
  { index: 2, kind: 'aerobic', planned: { distanceKm: 2 }, actual: { distanceKm: 1.8 } },
  { index: 3, kind: 'strength', planned: { sets: 4 } },
];

describe('hybridRings', () => {
  it('fills against the plan', () => {
    const r = hybridRings({
      segments,
      summary: { segmentCount: 4, completedAerobicSegments: 2, completedStrengthSegments: 1, totalActualDistanceKm: 3.7, totalStrengthSets: 7 },
    });
    expect(r.map((x) => [x.key, x.value, x.pct])).toEqual([
      ['distance', '3.70', 93],
      ['sets', '7/12', 58],
      ['segments', '3/4', 75],
    ]);
    expect(r[0].sub).toBe('מתוך 4.0 ק״מ');
  });
});

describe('hybridStationTables', () => {
  it('one table per station with a saved log; numbered when several', () => {
    const t = hybridStationTables(segments);
    expect(t).toHaveLength(1);
    expect(t[0].title).toBe('תחנת כוח 1');
    expect(t[0].rows[0].tiles.map((x) => x.tone)).toEqual(['in', 'in']);
  });
});

describe('repTableModel — planned runs per-rep table (F-1g)', () => {
  const rec = (rep: number, sec: number, pace?: number, inRange?: boolean, delta?: number) => ({
    blockIndex: rep * 2 - 1, rep, label: 'אינטרוול', distanceMeters: 400, durationSeconds: sec,
    ...(pace ? { avgPaceSec: pace, targetMinPaceSec: 285, targetMaxPaceSec: 295 } : {}),
    ...(inRange !== undefined ? { inRange, paceDeltaSec: delta ?? 0 } : {}),
  });

  it('absent / empty blockResults ⇒ null (older docs, free runs keep the laps UI)', () => {
    expect(repTableModel(undefined)).toBeNull();
    expect(repTableModel([])).toBeNull();
  });

  it('rows + common band + "N/M בטווח"', () => {
    const m = repTableModel([rec(1, 115, 288, true), rec(2, 119, 298, false, 3), rec(3, 116, 290, true)])!;
    expect(m.rows.map((r) => [r.n, r.title, r.value, r.status, r.tone])).toEqual([
      [1, '1:55', '4:48', 'בטווח', 'in'],
      [2, '1:59', '4:58', 'איטי ב-3 שנ׳', 'off'],
      [3, '1:56', '4:50', 'בטווח', 'in'],
    ]);
    expect(m.rows[0].sub).toBe('יעד 4:45–4:55');
    expect(m.band).toEqual({ min: 285, max: 295 });
    expect(m.shortLabel).toBe('2/3 בטווח');
    expect(m.summaryLabel).toBe('2 מתוך 3 חזרות בטווח');
  });

  it('unscored reps (short legs) show time, no status, no label', () => {
    const m = repTableModel([rec(1, 40)])!;
    expect(m.rows[0]).toMatchObject({ value: '0:40', tone: 'none' });
    expect(m.rows[0].status).toBeUndefined();
    expect(m.shortLabel).toBeNull();
    expect(m.band).toBeNull();
  });
});
