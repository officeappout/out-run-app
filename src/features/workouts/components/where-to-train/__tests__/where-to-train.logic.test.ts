import { describe, expect, it } from 'vitest';
import {
  gearCoverage,
  nearestWithin,
  parkScore,
  rankParksForWorkout,
  WHERE_TO_TRAIN_MAX_CARDS,
  WHERE_TO_TRAIN_RADIUS_M,
} from '../where-to-train.logic';

describe('gearCoverage', () => {
  it('is 1 for a workout that needs no gear (bodyweight / none ignored)', () => {
    expect(gearCoverage([], [])).toBe(1);
    expect(gearCoverage(['bodyweight', 'none'], [])).toBe(1);
  });
  it('is the share of needed gear the park has (duplicates counted once)', () => {
    expect(gearCoverage(['pullup_bar', 'dip_station', 'pullup_bar'], ['pullup_bar'])).toBe(0.5);
    expect(gearCoverage(['pullup_bar', 'dip_station'], ['dip_station', 'pullup_bar', 'rings'])).toBe(1);
    expect(gearCoverage(['rings'], ['pullup_bar'])).toBe(0);
  });
});

describe('parkScore', () => {
  it('loses DISTANCE_WEIGHT at the radius edge and clamps beyond it', () => {
    expect(parkScore(1, 0)).toBe(1);
    expect(parkScore(1, WHERE_TO_TRAIN_RADIUS_M)).toBe(0.5);
    expect(parkScore(1, WHERE_TO_TRAIN_RADIUS_M * 3)).toBe(0.5);
  });
});

describe('rankParksForWorkout', () => {
  const gear = ['pullup_bar', 'dip_station'];
  it('prefers a slightly farther park that has the gear over a closer bare one', () => {
    const ranked = rankParksForWorkout(
      [
        { id: 'near-bare', distanceM: 200, gearIds: [] },
        { id: 'far-full', distanceM: 900, gearIds: ['pullup_bar', 'dip_station'] },
      ],
      gear,
    );
    expect(ranked.map((p) => p.id)).toEqual(['far-full', 'near-bare']);
  });
  it('ranks by distance when coverage is equal, then by id', () => {
    const ranked = rankParksForWorkout(
      [
        { id: 'b', distanceM: 500, gearIds: ['pullup_bar'] },
        { id: 'a', distanceM: 500, gearIds: ['pullup_bar'] },
        { id: 'c', distanceM: 300, gearIds: ['pullup_bar'] },
      ],
      gear,
    );
    expect(ranked.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
  it('drops parks outside the radius and caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, distanceM: i * 100, gearIds: [] }));
    const ranked = rankParksForWorkout([...many, { id: 'far', distanceM: WHERE_TO_TRAIN_RADIUS_M + 1, gearIds: gear }], gear);
    expect(ranked).toHaveLength(WHERE_TO_TRAIN_MAX_CARDS);
    expect(ranked.some((p) => p.id === 'far')).toBe(false);
  });
  it('keeps the caller object (extra fields pass through)', () => {
    const [top] = rankParksForWorkout([{ id: 'x', distanceM: 10, gearIds: [], name: 'גינה' }], gear);
    expect(top.name).toBe('גינה');
  });
});

describe('nearestWithin', () => {
  it('sorts by distance, drops far / non-finite, caps at the limit', () => {
    const out = nearestWithin(
      [
        { id: 'c', distanceM: 1500 },
        { id: 'a', distanceM: 100 },
        { id: 'nan', distanceM: Number.NaN },
        { id: 'far', distanceM: 5000 },
        { id: 'b', distanceM: 400 },
      ],
      2,
    );
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
