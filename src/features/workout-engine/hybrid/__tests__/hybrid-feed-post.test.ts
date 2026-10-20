import { describe, expect, it } from 'vitest';
import { buildHybridPostParams, singleStationPark, HYBRID_POST_TITLE } from '../hybrid-feed-post';

const m = (o: Partial<Record<string, number>> = {}) => ({
  runMinutes: 12, runKm: 2.004, walkMinutes: 10, walkKm: 1, strengthMinutes: 15, strengthSets: 9, ...o,
});

describe('buildHybridPostParams', () => {
  it('route + stations → a cardio post with the km and per-part data', () => {
    const p = buildHybridPostParams(m());
    expect(p).toMatchObject({
      activityCategory: 'cardio',
      durationMinutes: 37,
      distanceKm: 3,
      title: HYBRID_POST_TITLE,
      hybridParts: { runKm: 2, walkKm: 1, runMinutes: 12, walkMinutes: 10, strengthMinutes: 15, strengthSets: 9 },
    });
    expect(p?.paceMinPerKm).toBeCloseTo(22 / 3, 2);
    expect(p).not.toHaveProperty('runSegment');
  });

  it('stations only → a strength post without distance', () => {
    const p = buildHybridPostParams(m({ runMinutes: 0, runKm: 0, walkMinutes: 0, walkKm: 0 }));
    expect(p?.activityCategory).toBe('strength');
    expect(p).not.toHaveProperty('distanceKm');
  });

  it('nothing done → no post', () => {
    expect(buildHybridPostParams(m({ runMinutes: 0, runKm: 0, walkMinutes: 0, walkKm: 0, strengthMinutes: 0, strengthSets: 0 }))).toBeNull();
  });

  it('adds the park only when all stations are in one park', () => {
    expect(buildHybridPostParams(m(), { parkId: 'p1', parkName: 'גן' })).toMatchObject({ parkId: 'p1', parkName: 'גן' });
  });
});

describe('singleStationPark', () => {
  it('one distinct park → that park; several or none → null', () => {
    const names = { p1: 'גן העצמאות' };
    expect(singleStationPark([{ kind: 'aerobic' }, { kind: 'strength', parkId: 'p1' }, { kind: 'strength', parkId: 'p1' }] as never, names))
      .toEqual({ parkId: 'p1', parkName: 'גן העצמאות' });
    expect(singleStationPark([{ kind: 'strength', parkId: 'p1' }, { kind: 'strength', parkId: 'p2' }] as never, names)).toBeNull();
    expect(singleStationPark(null, names)).toBeNull();
  });
});
