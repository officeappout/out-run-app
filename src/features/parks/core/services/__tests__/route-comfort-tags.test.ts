import { describe, it, expect } from 'vitest';
import {
  computeLitCoverage,
  shouldSuggestNightLighting,
  LIT_TAG_PROXIMITY_METERS,
  LIT_TAG_COVERAGE_THRESHOLD,
  type LitSegmentCandidate,
} from '../route-comfort-tags.service';

const routePath: [number, number][] = [
  [34.77, 32.05],
  [34.7701, 32.0501],
  [34.7702, 32.0502],
  [34.7703, 32.0503],
  [34.7704, 32.0504],
];

const litSegmentNear = (lng: number, lat: number): LitSegmentCandidate => ({
  id: 'lit-seg', path: [[lng, lat]], lit: true,
});
const unlitSegmentNear = (lng: number, lat: number): LitSegmentCandidate => ({
  id: 'unlit-seg', path: [[lng, lat]], lit: false,
});
const farSegment: LitSegmentCandidate = { id: 'far', path: [[34.80, 32.08]], lit: true };

describe('computeLitCoverage', () => {
  it('returns 1.0 when every point has a nearby lit segment', () => {
    const candidatesPerPoint = routePath.map(([lng, lat]) => [litSegmentNear(lng, lat)]);
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBe(1);
  });

  it('returns 0 when no point has any nearby segment', () => {
    const candidatesPerPoint = routePath.map(() => [farSegment]);
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBe(0);
  });

  it('returns 0 when nearby segments exist but are not lit', () => {
    const candidatesPerPoint = routePath.map(([lng, lat]) => [unlitSegmentNear(lng, lat)]);
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBe(0);
  });

  it('computes a partial fraction correctly (2 of 5 points lit)', () => {
    const candidatesPerPoint = routePath.map(([lng, lat], i) =>
      i < 2 ? [litSegmentNear(lng, lat)] : [farSegment],
    );
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBeCloseTo(0.4, 5);
  });

  it('ignores a lit segment beyond the proximity threshold', () => {
    // built far from routePath[0] specifically, beyond 20m default
    const farButLit: LitSegmentCandidate = { id: 'x', path: [[34.77 + 0.001, 32.05 + 0.001]], lit: true };
    const candidatesPerPoint = [[farButLit], [], [], [], []];
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBe(0);
  });

  it('a point with no candidates at all counts as not-lit, not an error', () => {
    const candidatesPerPoint = [[litSegmentNear(34.77, 32.05)], [], [], [], []];
    expect(computeLitCoverage(routePath, candidatesPerPoint)).toBeCloseTo(0.2, 5);
  });

  it('returns 0 for an empty route path', () => {
    expect(computeLitCoverage([], [])).toBe(0);
  });

  it('respects a custom threshold', () => {
    const near: LitSegmentCandidate = { id: 'x', path: [[34.7701, 32.0501]], lit: true };
    const candidatesPerPoint = [[near], [], [], [], []];
    // ~13m away from routePath[0] -> within a generous 50m threshold, outside a strict 5m one
    expect(computeLitCoverage(routePath, candidatesPerPoint, 50)).toBeGreaterThan(0);
    expect(computeLitCoverage(routePath, candidatesPerPoint, 5)).toBe(0);
  });
});

describe('shouldSuggestNightLighting', () => {
  it('suggests at/above the default threshold', () => {
    expect(shouldSuggestNightLighting(LIT_TAG_COVERAGE_THRESHOLD)).toBe(true);
    expect(shouldSuggestNightLighting(1)).toBe(true);
  });

  it('does not suggest below the default threshold', () => {
    expect(shouldSuggestNightLighting(LIT_TAG_COVERAGE_THRESHOLD - 0.01)).toBe(false);
    expect(shouldSuggestNightLighting(0)).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(shouldSuggestNightLighting(0.3, 0.25)).toBe(true);
    expect(shouldSuggestNightLighting(0.2, 0.25)).toBe(false);
  });
});

describe('constants sanity', () => {
  it('proximity is tighter than Stage 3s climb-route threshold (40m)', () => {
    expect(LIT_TAG_PROXIMITY_METERS).toBeLessThan(40);
  });
});
