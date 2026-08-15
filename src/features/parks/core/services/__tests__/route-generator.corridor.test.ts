import { describe, it, expect } from 'vitest';
import { buildCorridorRoute } from '../route-generator.service';
import type { Route } from '../../types/route.types';

// Two points ~1km apart (1km / 111km-per-degree of latitude ≈ 0.009009°).
const KM_PER_DEGREE = 111;
const onePointPath: [number, number][] = [
  [34.77, 32.05],
  [34.77, 32.05 + 1 / KM_PER_DEGREE],
];

function minimalCorridor(overrides: Partial<Route> = {}): Route {
  return {
    id: 'CY5KMrNMD90UAyuU3wom',
    name: 'הקפת פארק המסילה',
    distance: 1.87,
    duration: 19,
    score: 80,
    type: 'running',
    difficulty: 'easy',
    rating: 0,
    calories: 112,
    features: { hasGym: false, hasBenches: false, lit: true, scenic: true, terrain: 'flat', environment: 'park', trafficLoad: 'low', surface: 'paved' },
    segments: [],
    path: onePointPath,
    ...overrides,
  };
}

describe('buildCorridorRoute — Phase 1 corridor-following (15.08.2026)', () => {
  it('passes the corridor path through verbatim — same array contents, not re-derived', () => {
    const corridor = minimalCorridor();
    const route = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    expect(route.path).toEqual(onePointPath);
  });

  it('computes distance from the real path length, not the corridor doc\'s own distance field', () => {
    const corridor = minimalCorridor({ distance: 999 }); // deliberately wrong, must be ignored
    const route = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    expect(route.distance).toBeCloseTo(1.0, 1); // path is really ~1km
  });

  it('duration scales by the REQUESTED activity pace, not the corridor doc\'s own duration field', () => {
    const corridor = minimalCorridor({ duration: 999 }); // deliberately wrong, must be ignored
    const walking = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    const running = buildCorridorRoute(corridor, corridor.id, 'running', 0);
    const cycling = buildCorridorRoute(corridor, corridor.id, 'cycling', 0);
    // Same ~1km path — faster activity must yield a shorter duration.
    expect(running.duration).toBeLessThan(walking.duration);
    expect(cycling.duration).toBeLessThan(running.duration);
  });

  it('sets sourceOfficialRouteIds to exactly the one followed corridor id', () => {
    const corridor = minimalCorridor();
    const route = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    expect(route.sourceOfficialRouteIds).toEqual(['CY5KMrNMD90UAyuU3wom']);
  });

  it('id is deterministic per (corridor id, generation index) — not a random/timestamp id', () => {
    const corridor = minimalCorridor();
    const a = buildCorridorRoute(corridor, corridor.id, 'walking', 2);
    const b = buildCorridorRoute(corridor, corridor.id, 'walking', 2);
    expect(a.id).toBe(b.id);
    expect(a.id).toContain(corridor.id);
  });

  it('falls back to sane defaults when the corridor doc is missing name/rating/features (OSM-import docs may lack some)', () => {
    const corridor = minimalCorridor({ name: undefined as any, rating: undefined as any, features: undefined as any });
    const route = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    expect(route.name).toBeTruthy();
    expect(route.rating).toBeGreaterThan(0);
    expect(route.features).toBeTruthy();
  });

  it('marks includesOfficialSegments true — this route IS an official corridor, not a generated one', () => {
    const corridor = minimalCorridor();
    const route = buildCorridorRoute(corridor, corridor.id, 'walking', 0);
    expect(route.includesOfficialSegments).toBe(true);
  });
});
