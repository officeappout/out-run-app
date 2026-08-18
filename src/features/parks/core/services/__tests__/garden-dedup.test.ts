import { describe, it, expect } from 'vitest';
import {
  findNearestGardenMatch,
  isDuplicateOfExistingGarden,
  GARDEN_DEDUP_RADIUS_METERS,
  type GardenCandidate,
} from '../garden-dedup.service';

const KM_PER_DEGREE = 111;

const parkA: GardenCandidate = { id: 'park-a', lat: 32.05, lng: 34.77 };
const parkB: GardenCandidate = { id: 'park-b', lat: 32.06, lng: 34.78 }; // far from parkA

describe('findNearestGardenMatch', () => {
  it('matches a point within the threshold', () => {
    const point = { lat: 32.05, lng: 34.77 + 0.0002 }; // ~19m east of parkA
    const match = findNearestGardenMatch(point, [parkA]);
    expect(match).not.toBeNull();
    expect(match!.parkId).toBe('park-a');
    expect(match!.distanceMeters).toBeLessThan(GARDEN_DEDUP_RADIUS_METERS);
  });

  it('returns null when nothing is within the threshold', () => {
    const point = { lat: 32.05 + 2 / KM_PER_DEGREE, lng: 34.77 }; // ~2km north
    expect(findNearestGardenMatch(point, [parkA])).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(findNearestGardenMatch({ lat: 32.05, lng: 34.77 }, [])).toBeNull();
  });

  it('picks the NEAREST candidate when multiple are within range', () => {
    const closeA: GardenCandidate = { id: 'close', lat: 32.05, lng: 34.77 + 0.00005 }; // ~5m
    const closeB: GardenCandidate = { id: 'far-but-in-range', lat: 32.05, lng: 34.77 + 0.0003 }; // ~28m
    const point = { lat: 32.05, lng: 34.77 };
    const match = findNearestGardenMatch(point, [closeB, closeA]); // order shouldn't matter
    expect(match!.parkId).toBe('close');
  });

  it('respects a custom threshold', () => {
    const point = { lat: 32.05, lng: 34.77 + 0.0003 }; // ~28m from parkA
    expect(findNearestGardenMatch(point, [parkA], 50)).not.toBeNull();
    expect(findNearestGardenMatch(point, [parkA], 10)).toBeNull();
  });

  it('a point exactly at a candidate location matches at ~0m', () => {
    const match = findNearestGardenMatch({ lat: parkA.lat, lng: parkA.lng }, [parkA]);
    expect(match!.distanceMeters).toBeCloseTo(0, 3);
  });
});

describe('isDuplicateOfExistingGarden', () => {
  it('true when a match exists', () => {
    const point = { lat: 32.05, lng: 34.77 + 0.0001 };
    expect(isDuplicateOfExistingGarden(point, [parkA])).toBe(true);
  });

  it('false when no match exists (a genuine new discovery)', () => {
    const point = { lat: 32.09, lng: 34.82 };
    expect(isDuplicateOfExistingGarden(point, [parkA, parkB])).toBe(false);
  });
});
