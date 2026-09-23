import { describe, it, expect } from 'vitest';
import { resolveContributionAuthority } from '../contribution.service';
import type { AuthorityBoundary } from '@/lib/route-collections/authority-resolution';

const SQUARE_POLYGON = (id: string, name: string): AuthorityBoundary => ({
  id,
  name,
  boundaryGeoJSON: {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[34.0, 32.0], [34.0, 32.1], [34.1, 32.1], [34.1, 32.0], [34.0, 32.0]]],
    },
  },
});

const RADIUS_AUTHORITY: AuthorityBoundary = {
  id: 'radius-auth',
  name: 'Radius City',
  coordinates: { lat: 31.5, lng: 34.6 },
  radiusKm: 5,
};

const NO_GEO_AUTHORITY: AuthorityBoundary = {
  id: 'no-geo-auth',
  name: 'Sderot (no boundary today)',
  // Mirrors the real, current Sderot doc: a bare coordinates point, no
  // boundaryGeoJSON, no radiusKm — resolveAuthorityForPoint can't use this.
  coordinates: { lat: 31.525, lng: 34.5955 },
};

describe('resolveContributionAuthority', () => {
  it('resolves via polygon containment and needs no manual tagging', () => {
    const result = resolveContributionAuthority(
      { lat: 32.05, lng: 34.05 },
      undefined,
      [SQUARE_POLYGON('city-a', 'City A')],
    );
    expect(result).toEqual({ authorityId: 'city-a', needsAuthorityTagging: false });
  });

  it('resolves via radius fallback when no polygon matches', () => {
    const result = resolveContributionAuthority(
      { lat: 31.51, lng: 34.61 },
      undefined,
      [RADIUS_AUTHORITY],
    );
    expect(result).toEqual({ authorityId: 'radius-auth', needsAuthorityTagging: false });
  });

  it("flags needsAuthorityTagging when no authority has usable geo data (today's real Sderot case)", () => {
    const result = resolveContributionAuthority(
      { lat: 31.534, lng: 34.596 },
      undefined,
      [NO_GEO_AUTHORITY],
    );
    expect(result).toEqual({ authorityId: undefined, needsAuthorityTagging: true });
  });

  it('flags needsAuthorityTagging on an ambiguous match (point inside two boundaries)', () => {
    const overlapping = SQUARE_POLYGON('city-b', 'City B');
    const result = resolveContributionAuthority(
      { lat: 32.05, lng: 34.05 },
      undefined,
      [SQUARE_POLYGON('city-a', 'City A'), overlapping],
    );
    expect(result).toEqual({ authorityId: undefined, needsAuthorityTagging: true });
  });

  it('falls back to an existing authorityId when resolution fails, without flagging', () => {
    const result = resolveContributionAuthority(
      { lat: 31.534, lng: 34.596 },
      'already-known-authority',
      [NO_GEO_AUTHORITY],
    );
    expect(result).toEqual({ authorityId: 'already-known-authority', needsAuthorityTagging: false });
  });

  it('prefers a fresh polygon resolution over a stale existing authorityId', () => {
    const result = resolveContributionAuthority(
      { lat: 32.05, lng: 34.05 },
      'stale-authority',
      [SQUARE_POLYGON('city-a', 'City A')],
    );
    expect(result).toEqual({ authorityId: 'city-a', needsAuthorityTagging: false });
  });

  it('flags needsAuthorityTagging when location is missing entirely', () => {
    const result = resolveContributionAuthority(null, undefined, [NO_GEO_AUTHORITY]);
    expect(result).toEqual({ authorityId: undefined, needsAuthorityTagging: true });
  });
});
