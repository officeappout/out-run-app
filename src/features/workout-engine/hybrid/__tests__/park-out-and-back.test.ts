import { describe, it, expect } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import {
  buildOutAndBackPath,
  roundTripKm,
  nearestEquippedPark,
  type LngLat,
} from '../park-out-and-back';

// ── buildOutAndBackPath — the ⚠️ out-and-back synthesis (generator is one-way) ──
describe('buildOutAndBackPath', () => {
  const A: LngLat = [34.0, 32.0];
  const B: LngLat = [34.1, 32.1];
  const C: LngLat = [34.2, 32.2];

  it('appends the reversed outbound without duplicating the turnaround', () => {
    expect(buildOutAndBackPath([A, B, C])).toEqual([A, B, C, B, A]);
  });

  it('handles a two-vertex outbound', () => {
    expect(buildOutAndBackPath([A, B])).toEqual([A, B, A]);
  });

  it('returns inputs shorter than 2 vertices unchanged', () => {
    expect(buildOutAndBackPath([A])).toEqual([A]);
    expect(buildOutAndBackPath([])).toEqual([]);
  });

  it('produces length 2n-1 for n>=2 and starts+ends at the user vertex', () => {
    const out = buildOutAndBackPath([A, B, C]);
    expect(out).toHaveLength(2 * 3 - 1);
    expect(out[0]).toEqual(A);
    expect(out[out.length - 1]).toEqual(A);
  });

  it('does not mutate the input array', () => {
    const input: LngLat[] = [A, B, C];
    buildOutAndBackPath(input);
    expect(input).toEqual([A, B, C]);
  });
});

// ── roundTripKm — straight-line one-way × 2 ──
describe('roundTripKm', () => {
  const user = { lat: 32.08, lng: 34.78 };

  it('is 0 for the same point', () => {
    expect(roundTripKm(user, user)).toBe(0);
  });

  it('grows with distance (nearer < farther)', () => {
    const near = { lat: 32.08, lng: 34.781 };
    const far = { lat: 32.08, lng: 34.80 };
    expect(roundTripKm(user, near)).toBeLessThan(roundTripKm(user, far));
  });

  it('is ~2× the one-way distance (~1km park → ~2km round trip)', () => {
    // 0.01° lng at lat 32 ≈ 0.94 km one-way → ~1.9 km round trip.
    const km = roundTripKm(user, { lat: 32.08, lng: 34.79 });
    expect(km).toBeGreaterThan(1.5);
    expect(km).toBeLessThan(2.5);
  });
});

// ── nearestEquippedPark — pure park selection (no gear cache / no I/O) ──
describe('nearestEquippedPark', () => {
  const user = { lat: 32.08, lng: 34.78 };

  const mk = (over: Record<string, unknown>): Park =>
    ({
      id: 'p',
      name: 'Park',
      location: { lat: 32.08, lng: 34.78 },
      gymEquipment: [{ equipmentId: 'pullup_bar' }],
      sportTypes: ['calisthenics'],
      ...over,
    } as unknown as Park);

  it('returns null when there are no parks', () => {
    expect(nearestEquippedPark(user, [])).toBeNull();
  });

  it('skips non-primary parks', () => {
    const soccer = mk({ id: 'soccer', sportTypes: ['soccer'], gymEquipment: [{ equipmentId: 'goal' }] });
    expect(nearestEquippedPark(user, [soccer])).toBeNull();
  });

  it('skips primary parks with no gymEquipment', () => {
    const bare = mk({ id: 'bare', gymEquipment: [] });
    expect(nearestEquippedPark(user, [bare])).toBeNull();
  });

  it('skips parks with a missing location', () => {
    const noLoc = mk({ id: 'noloc', location: undefined });
    expect(nearestEquippedPark(user, [noLoc])).toBeNull();
  });

  it('accepts a park classified primary via gym_park category', () => {
    const gymPark = mk({ id: 'gp', sportTypes: [], category: 'gym_park' });
    expect(nearestEquippedPark(user, [gymPark])?.id).toBe('gp');
  });

  it('returns the nearest qualifying park', () => {
    const near = mk({ id: 'near', location: { lat: 32.08, lng: 34.781 } });
    const far = mk({ id: 'far', location: { lat: 32.08, lng: 34.80 } });
    expect(nearestEquippedPark(user, [far, near])?.id).toBe('near');
  });

  it('prefers a farther PRIMARY-equipped park over a nearer non-qualifying one', () => {
    const nearSoccer = mk({ id: 'nearSoccer', location: { lat: 32.08, lng: 34.7805 }, sportTypes: ['soccer'] });
    const farPrimary = mk({ id: 'farPrimary', location: { lat: 32.08, lng: 34.79 }, sportTypes: ['functional'] });
    expect(nearestEquippedPark(user, [nearSoccer, farPrimary])?.id).toBe('farPrimary');
  });

  it('respects maxRadiusMeters (excludes the only candidate when too far)', () => {
    const far = mk({ id: 'far', location: { lat: 32.08, lng: 34.80 } }); // ~1.9 km away
    expect(nearestEquippedPark(user, [far], { maxRadiusMeters: 500 })).toBeNull();
    expect(nearestEquippedPark(user, [far], { maxRadiusMeters: 5000 })?.id).toBe('far');
  });
});
