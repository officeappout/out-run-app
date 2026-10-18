import { describe, expect, it } from 'vitest';
import type { SessionSegmentRecord } from '@/features/workout-engine/core/services/storage.service';
import { aerobicRings, hybridRings, hybridStationTables, paceLabel, timeLabel } from '../v2-summary.mapping';

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
