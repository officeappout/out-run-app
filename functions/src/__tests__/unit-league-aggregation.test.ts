import { describe, expect, it } from 'vitest';
import { computeUnitAggregates, type ReservistActivity, type UnitDirectoryEntry } from '../unit-league-aggregation';

const units: UnitDirectoryEntry[] = [
  { directoryId: 'b810', level: 'brigade', orgId: 'b810', unitId: null },
  { directoryId: 'b810__bat1', level: 'battalion', orgId: 'b810', unitId: 'bat1' },
];
const r = (unitPathIds: string[], avgSteps: number, avgDistanceMeters?: number, isActive = true): ReservistActivity => ({
  orgId: 'b810',
  unitPathIds,
  isActive,
  avgSteps,
  avgDistanceMeters,
});

describe('computeUnitAggregates — km next to the steps', () => {
  it('averages daily meters over the active reservists, like avgSteps', () => {
    const out = computeUnitAggregates(units, [r(['bat1'], 6000, 4000), r(['bat1'], 9000, 7000), r([], 3000, 1000), r(['bat1'], 0, 0, false)], 3);
    const brigade = out.find((a) => a.directoryId === 'b810')!;
    expect(brigade).toEqual({ directoryId: 'b810', activeParticipantCount: 3, avgSteps: 6000, avgDistanceMeters: 4000 });
  });
  it('under the floor → null, like avgSteps', () => {
    const out = computeUnitAggregates(units, [r(['bat1'], 6000, 4000), r(['bat1'], 9000, 7000), r([], 3000, 1000)], 3);
    expect(out.find((a) => a.directoryId === 'b810__bat1')).toEqual({ directoryId: 'b810__bat1', activeParticipantCount: 2, avgSteps: null, avgDistanceMeters: null });
  });
  it('older inputs without distance count as 0 m', () => {
    const out = computeUnitAggregates(units, [r([], 3000), r([], 3000), r([], 3000, 900)], 3);
    expect(out.find((a) => a.directoryId === 'b810')!.avgDistanceMeters).toBe(300);
  });
});
