/**
 * routeScore v1.4 — owner decision Q-D (22.10.2026): a walkway separated from
 * a major road (urban-measure's separatedMajorPct) gets partial safety and
 * full surface weight for walking / running routes; bike routes and inputs
 * without the measurement score exactly as in v1.3.
 */
import { describe, expect, it } from 'vitest';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { scoreSafety, scoreSurface, separatedWalkwayShare } from '../components';
import { routeScore } from '../score';
import { SCORE_WEIGHTS, SEPARATED_WALKWAY_SAFETY_SHARE } from '../weights';
import { rectLoop } from './fixtures';

const doc = (activityType: string) => ({
  name: 'לאורך ז׳בוטינסקי', origin: 'bike_adjacent_walk', distance: 3, activityType,
  path: rectLoop(34.88, 32.09, 800, 600).map(([lng, lat]) => ({ lng, lat })),
});
const SIDEWALK_COMP = { sidewalkPct: 80, genuinePct: 10, ordinaryPct: 10, otherPct: 0 };
const opts = (sep: number | undefined, unmarkedPerKm = 0) => ({
  composition: SIDEWALK_COMP,
  osmSafety: { majorRoadPct: 0.8, unmarkedPerKm, ...(sep != null ? { separatedMajorPct: sep } : {}) },
});

describe('routeScore v1.4 — Q-D separated walkway beside a major road', () => {
  it('v1.3 inputs (no separatedMajorPct) score exactly as before: safety 0 on the road', () => {
    const i = routeScoreInputFromDoc('r', doc('walking'), opts(undefined));
    expect(separatedWalkwayShare(i)).toBe(0);
    expect(scoreSafety(i).points).toBe(0);
    expect(scoreSurface(i).points).toBe(Math.round(SCORE_WEIGHTS.surface * (10 + 5 + 20) / 100 * 10) / 10);
  });

  it('walking, fully separated → half the safety points instead of 0, sidewalk at full surface weight', () => {
    const i = routeScoreInputFromDoc('r', doc('walking'), opts(0.8));
    expect(scoreSafety(i).points).toBe(SCORE_WEIGHTS.safety * SEPARATED_WALKWAY_SAFETY_SHARE);
    expect(scoreSafety(i).notes.join(' ')).toContain('separated walkway');
    // genuine 10 + ½·10 ordinary + 1·80 sidewalk = 95 %
    expect(scoreSurface(i).points).toBe(Math.round(SCORE_WEIGHTS.surface * 0.95 * 10) / 10);
    expect(routeScore(i).score).toBeGreaterThan(routeScore(routeScoreInputFromDoc('r', doc('walking'), opts(undefined))).score);
  });

  it('running counts like walking', () => {
    expect(scoreSafety(routeScoreInputFromDoc('r', doc('running'), opts(0.8))).points).toBe(SCORE_WEIGHTS.safety * SEPARATED_WALKWAY_SAFETY_SHARE);
  });

  it('unmarked major-road crossings are still penalised', () => {
    const clean = scoreSafety(routeScoreInputFromDoc('r', doc('walking'), opts(0.8))).points;
    const crossings = scoreSafety(routeScoreInputFromDoc('r', doc('walking'), opts(0.8, 0.5))).points;
    expect(crossings).toBe(clean - 3);
  });

  it('partly separated: the on-road rest still costs the full v1.3 rate', () => {
    // 0.1 on the road (→ ⅓ lost) + 0.1 separated (→ ⅓ × ½ lost) = keeps ½ of 15.
    const i = routeScoreInputFromDoc('r', doc('walking'), { composition: SIDEWALK_COMP, osmSafety: { majorRoadPct: 0.2, unmarkedPerKm: 0, separatedMajorPct: 0.1 } });
    expect(scoreSafety(i).points).toBe(7.5);
  });

  it('separation is capped by the major-road share and by the composition sidewalk share', () => {
    const i = routeScoreInputFromDoc('r', doc('walking'), { composition: { sidewalkPct: 20, genuinePct: 0, ordinaryPct: 80, otherPct: 0 }, osmSafety: { majorRoadPct: 0.5, unmarkedPerKm: 0, separatedMajorPct: 0.9 } });
    expect(separatedWalkwayShare(i)).toBe(0.5);
    // ordinary ½·80 = 40 + sidewalk 20 at full weight (capped at 20, not 50) = 60 %
    expect(scoreSurface(i).points).toBe(Math.round(SCORE_WEIGHTS.surface * 0.6 * 10) / 10);
  });

  it('bike routes keep the v1.3 rules', () => {
    const bike = routeScoreInputFromDoc('r', doc('cycling'), opts(0.8));
    const v13 = routeScoreInputFromDoc('r', doc('cycling'), opts(undefined));
    expect(separatedWalkwayShare(bike)).toBe(0);
    expect(scoreSafety(bike)).toEqual(scoreSafety(v13));
    expect(scoreSurface(bike)).toEqual(scoreSurface(v13));
  });
});
