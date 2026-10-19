/**
 * trail-graph/route-elevation.ts — stored elevation profile per route
 * (19.10.2026). Segment profiles only keep aggregates (gain / grade / min /
 * max), so the route's own profile is sampled along its stitched geometry
 * here, through the same storable Copernicus provider the segment pass uses.
 */
import { computeElevationProfileSamples } from '../dem-tile-cache/elevation-profile';
import type { ElevationProvider } from '../dem-tile-cache/elevation-provider';
import type { TrailRoute } from './types';

/** Sets `elevationProfile` on every route DEM covers end to end; returns how many got one. */
export function attachElevationProfiles(routes: TrailRoute[], provider: ElevationProvider): number {
  let n = 0;
  for (const r of routes) {
    const p = computeElevationProfileSamples(r.geometry, provider);
    if (p) { r.elevationProfile = p; n++; } else delete r.elevationProfile;
  }
  return n;
}
