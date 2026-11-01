import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));

import { parkSearchBox } from '../parks.service';
import { calculateDistance } from '@/lib/services/location.service';

// getParksNear replaced getAllParks() for radius questions (data-exposure plan 1.1). The box
// must contain every park its callers' exact distance check would accept, or a park silently
// disappears from duplicate-check / first-workout / park-detection.
describe('parkSearchBox', () => {
  const cases: Array<[number, number, number]> = [
    [32.08, 34.78, 50],     // Tel Aviv, contribution duplicate check
    [31.25, 34.79, 200],    // Be'er Sheva, session tagging
    [33.0, 35.5, 1_000],    // north, equipment resolver
    [29.55, 34.95, 2_000],  // Eilat, first-workout search
  ];

  it.each(cases)('contains every point at the radius around (%f, %f) r=%i', (lat, lng, r) => {
    const { dLat, dLng } = parkSearchBox(lat, r);
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      // Walk outward along the bearing until the real distance reaches r.
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const pLat = lat + mid * Math.cos(a);
        const pLng = lng + mid * Math.sin(a);
        if (calculateDistance(lat, lng, pLat, pLng) < r) lo = mid; else hi = mid;
      }
      expect(Math.abs(lo * Math.cos(a))).toBeLessThanOrEqual(dLat);
      expect(Math.abs(lo * Math.sin(a))).toBeLessThanOrEqual(dLng);
    }
  });
});
