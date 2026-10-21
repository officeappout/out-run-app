import { describe, expect, it } from 'vitest';
import { routeScore, scoreBand } from '../score';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { scoreComfort, scoreExperience, scoreGeometry, scoreSafety, scoreSource, scoreSurface } from '../components';
import type { RouteScoreInput } from '../types';
import { parkHaMesilaDoc, rectLoop, line } from './fixtures';

function base(over: Partial<RouteScoreInput> = {}): RouteScoreInput {
  return {
    id: 'r', name: 'x', authorityId: 'a', city: 'c', activityType: 'running', distanceKm: 5,
    path: rectLoop(34.8, 32.1, 800, 600), shape: 'loop', composition: null, litCoveragePct: null,
    amenitiesHas: null, osmSafety: null, geometry: { retracedPct: 0, uTurnCount: 0, spurCount: 0, compactness: 0.7 },
    sourceTier: 'osm_named', greenShare: null, parkRef: null, hasFitnessStop: false, certificate: null,
    surface: { pavedShare: 1, unpavedShare: 0, knownShare: 1, source: 'route_surface_type' }, surfaceClass: 'walk_run_paved', shadeShare: null, ...over,
  };
}

describe('routeScore — calibration anchor', () => {
  it('Park HaMesila loop comes out green (§3.3: the anchor must be green)', () => {
    const input = routeScoreInputFromDoc('CY5KMrNMD90UAyuU3wom', parkHaMesilaDoc());
    expect(input.certificate).toBe('approve');
    expect(input.sourceTier).toBe('named_place');
    expect(input.shape).toBe('loop');
    const s = routeScore(input);
    expect(s.score).toBeGreaterThanOrEqual(75);
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
    expect(s.band).toBe('green');
  });
});

describe('components', () => {
  it('surface: all genuine = full, unknown composition = half with zero coverage', () => {
    expect(scoreSurface(base({ composition: { genuinePct: 100, sidewalkPct: 0, ordinaryPct: 0, otherPct: 0 } })).points).toBe(25);
    const m = scoreSurface(base());
    expect(m.points).toBe(12.5);
    expect(m.coverage).toBe(0);
  });
  it('surface: other share is penalised, never below 0', () => {
    expect(scoreSurface(base({ composition: { genuinePct: 0, sidewalkPct: 0, ordinaryPct: 0, otherPct: 100 } })).points).toBe(0);
  });
  it('geometry: clean loop = 20; retrace, U-turns and low compactness cost points', () => {
    expect(scoreGeometry(base()).points).toBe(20);
    const bad = scoreGeometry(base({ geometry: { retracedPct: 0.3, uTurnCount: 2, spurCount: 0, compactness: 0.05 } }));
    expect(bad.points).toBeLessThan(10);
    expect(bad.notes.length).toBe(3);
  });
  it('geometry: a linear corridor is not penalised on compactness', () => {
    const g = scoreGeometry(base({ shape: 'linear_corridor', geometry: { retracedPct: 0, uTurnCount: 0, spurCount: 0, compactness: 0 } }));
    expect(g.points).toBe(18);
  });
  it('geometry: an out-and-back keeps its single turnaround and is not penalised for retrace', () => {
    const g = scoreGeometry(base({ shape: 'out_and_back', geometry: { retracedPct: 0.5, uTurnCount: 1, spurCount: 0, compactness: 0 } }));
    expect(g.points).toBe(14);
  });
  it('safety: measured beats proxy; proxy counts half coverage', () => {
    expect(scoreSafety(base({ osmSafety: { majorRoadPct: 0, unmarkedPerKm: 0 } }))).toMatchObject({ points: 15, coverage: 1 });
    expect(scoreSafety(base({ osmSafety: { majorRoadPct: 0.3, unmarkedPerKm: 0 } })).points).toBe(0);
    const proxy = scoreSafety(base({ composition: { genuinePct: 100, sidewalkPct: 0, ordinaryPct: 0, otherPct: 0 } }));
    expect(proxy).toMatchObject({ points: 15, coverage: 0.5 });
  });
  it('source: tier points follow §3.3', () => {
    expect(scoreSource(base({ sourceTier: 'official' })).points).toBe(15);
    expect(scoreSource(base({ sourceTier: 'osm_named' })).points).toBe(12);
    expect(scoreSource(base({ sourceTier: 'named_place' })).points).toBe(10);
    expect(scoreSource(base({ sourceTier: 'stitched' })).points).toBe(6);
    expect(scoreSource(base({ sourceTier: 'generated' })).points).toBe(3);
  });
  it('comfort: lit + water + bench = 14; nothing measured = half', () => {
    expect(scoreComfort(base({ litCoveragePct: 100, amenitiesHas: { drinking_water: true, bench: true } })).points).toBe(14);
    expect(scoreComfort(base())).toMatchObject({ points: 7.5, coverage: 0 });
  });
  it('comfort: shade (RC2) joins at the owner-approved 40% canopy bar', () => {
    const full = scoreComfort(base({ litCoveragePct: 100, amenitiesHas: { drinking_water: true, bench: true, court: true }, shadeShare: 0.4 }));
    expect(full).toMatchObject({ points: 15, coverage: 1 });
    const noShade = scoreComfort(base({ litCoveragePct: 100, amenitiesHas: { drinking_water: true, bench: true, court: true }, shadeShare: 0 }));
    expect(noShade.points).toBe(11);
    // absent shade does not lower coverage
    expect(scoreComfort(base({ litCoveragePct: 100, amenitiesHas: {} })).coverage).toBe(1);
  });
  it('experience: fitness stop is a bonus of at most 2, total capped at 10', () => {
    const without = scoreExperience(base({ greenShare: 1 })).points;
    const withStop = scoreExperience(base({ greenShare: 1, hasFitnessStop: true })).points;
    expect(withStop - without).toBeLessThanOrEqual(2);
    expect(withStop).toBeLessThanOrEqual(10);
  });
  it('experience: very short and very long routes lose the length points', () => {
    expect(scoreExperience(base({ distanceKm: 0.5, greenShare: 0 })).points).toBe(0);
    expect(scoreExperience(base({ distanceKm: 5, greenShare: 0 })).points).toBe(3);
  });
});

describe('scoreBand', () => {
  it('green needs score, confidence and certificate approve', () => {
    expect(scoreBand(80, 0.9, 'approve')).toBe('green');
    expect(scoreBand(80, 0.9, null)).toBe('yellow');
    expect(scoreBand(80, 0.7, 'approve')).toBe('yellow');
    expect(scoreBand(80, 0.9, 'edit')).toBe('yellow');
  });
  it('red on low score or certificate drop', () => {
    expect(scoreBand(39, 1, 'approve')).toBe('red');
    expect(scoreBand(90, 1, 'drop')).toBe('red');
  });
});

describe('routeScore — partial data', () => {
  it('a route with nothing measured gets a middling score and low confidence, not zero', () => {
    const s = routeScore(base({ geometry: null, shape: null, distanceKm: null, sourceTier: 'unknown', path: line(34.8, 32.1, 100) }));
    expect(s.score).toBeGreaterThan(40);
    expect(s.confidence).toBeLessThan(0.3);
    expect(s.band).toBe('yellow');
  });
  it('score stays within 0..100', () => {
    const s = routeScore(base({ composition: { genuinePct: 100, sidewalkPct: 0, ordinaryPct: 0, otherPct: 0 }, litCoveragePct: 100,
      amenitiesHas: { drinking_water: true, bench: true, court: true }, osmSafety: { majorRoadPct: 0, unmarkedPerKm: 0 },
      sourceTier: 'official', greenShare: 1, hasFitnessStop: true, certificate: 'approve' }));
    expect(s.score).toBe(100);
    expect(s.confidence).toBe(1);
  });
});
