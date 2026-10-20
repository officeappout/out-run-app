import { describe, expect, it } from 'vitest';
import { buildRecordTiles, clock } from '../record-tiles';

const NOW = new Date(2026, 9, 21).getTime();
const DAY = 86_400_000;

describe('buildRecordTiles', () => {
  it('shows only real records, marks fresh ones', () => {
    const tiles = buildRecordTiles({
      records: { longestRunKm: { value: 12.14, at: NOW - 30 * DAY }, fastest5kSec: { value: 1678, at: NOW - 2 * DAY } },
      periodTotals: { '2026-09': { workouts: 18 }, '2026-10': { workouts: 12 } },
      longestStreak: 12,
      exercises: [
        { exerciseId: 'a', name: 'מתח', bestReps: 14, bestAt: NOW - DAY },
        { exerciseId: 'b', name: 'דיפס', bestReps: 0, bestAt: null },
      ],
      nowMs: NOW,
    });
    expect(tiles.map((t) => t.key)).toEqual(['ex:a', '5k', 'run', 'streak', 'month']);
    expect(tiles.find((t) => t.key === '5k')).toMatchObject({ value: '27:58', isNew: true });
    expect(tiles.find((t) => t.key === 'run')).toMatchObject({ value: '12.1', isNew: false });
    expect(tiles.find((t) => t.key === 'month')?.label).toContain('ספטמבר');
  });

  it('nothing → no tiles', () => {
    expect(buildRecordTiles({ nowMs: NOW })).toEqual([]);
    expect(clock(3725)).toBe('1:02:05');
  });
});
