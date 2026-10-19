import { describe, expect, it } from 'vitest';
import { climbReason, findBestClimbInProfile, findClimbForRoute } from '../climb-match';
import { makeRoute, profileWithClimb } from './fixtures';

const spec = { repLengthM: 300, minGradePct: 5, reps: 6 };

describe('findBestClimbInProfile', () => {
  it('finds a 6% / 300 m climb at km 1.2 and says so in Hebrew', () => {
    const c = findBestClimbInProfile(profileWithClimb(4000, 20, 1200, 300, 6), spec)!;
    expect(c.source).toBe('profile');
    expect(c.meetsSpec).toBe(true);
    expect(c.startM).toBe(1200);
    expect(c.lengthM).toBe(300);
    expect(c.avgGradePct).toBeCloseTo(6, 1);
    expect(climbReason(c)).toBe('עלייה של 6% באורך 300 מ׳ בק״מ 1.2');
  });

  it('a climb shorter than the rep does not meet the spec', () => {
    const c = findBestClimbInProfile(profileWithClimb(4000, 20, 1000, 100, 8), spec)!;
    expect(c.meetsSpec).toBe(false);
  });

  it('a shallow climb does not meet the spec', () => {
    const c = findBestClimbInProfile(profileWithClimb(4000, 20, 1000, 600, 2), spec)!;
    expect(c.meetsSpec).toBe(false);
    expect(c.avgGradePct).toBeCloseTo(2, 1);
  });

  it('flat → null', () => {
    expect(findBestClimbInProfile({ stepM: 50, elevationsM: Array(40).fill(10) }, spec)).toBeNull();
  });

  it('point-to-point: a descent on the way out is the climb back', () => {
    const p = profileWithClimb(2000, 20, 500, 400, 6);
    const down = { stepM: p.stepM, elevationsM: [...p.elevationsM].reverse() };
    const c = findBestClimbInProfile(down, spec, { alsoReverse: true })!;
    expect(c.meetsSpec).toBe(true);
    // way back starts at 2000 m; the climb (reversed) starts 500 m into it
    expect(c.startM).toBe(2500);
  });
});

describe('findClimbForRoute fallbacks', () => {
  it('uses a nearby terrain climb when there is no profile (grade only)', () => {
    const r = makeRoute({
      id: 't',
      terrainFeatures: [
        { climbSegmentId: 'c1', type: 'terrain', climbType: 'repeats', distanceFromPathMeters: 10, avgGrade: 7, maxGrade: 10 },
        { climbSegmentId: 'c2', type: 'stairs', climbType: 'stairs', distanceFromPathMeters: 5, avgGrade: null, maxGrade: null },
      ],
    });
    const c = findClimbForRoute(r, spec)!;
    expect(c).toMatchObject({ source: 'terrain', meetsSpec: true, startM: null });
    expect(climbReason(c)).toBe('עלייה של 7% ליד המסלול');
  });

  it('maxGrade alone is a hint, never meets the spec', () => {
    const c = findClimbForRoute(makeRoute({ id: 'm', maxGrade: 9 }), spec)!;
    expect(c).toMatchObject({ source: 'maxGrade', meetsSpec: false });
  });

  it('no data → null', () => {
    expect(findClimbForRoute(makeRoute({ id: 'n' }), spec)).toBeNull();
  });
});
