/**
 * Tree crowns from point data (OSM natural=tree, municipal tree surveys)
 * and tree rows, as small polygons the obstacle index can take. Pure.
 */
import { haversineM } from '../shade/geometry';
import type { LonLat } from '../shade/types';

/** Crown radius when a point tree carries no diameter (≈6 m wide street tree). */
export const DEFAULT_CROWN_RADIUS_M = 3;
/** Spacing of crowns along an OSM natural=tree_row. */
export const TREE_ROW_SPACING_M = 8;

const M_PER_DEG_LAT = 111_195;

export function crownRing(center: LonLat, radiusM = DEFAULT_CROWN_RADIUS_M, sides = 8): LonLat[] {
  const mLon = M_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180);
  const out: LonLat[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * 2 * Math.PI;
    out.push([center[0] + (radiusM * Math.cos(a)) / mLon, center[1] + (radiusM * Math.sin(a)) / M_PER_DEG_LAT]);
  }
  return out;
}

/** OSM `diameter_crown` (m) → radius, else the default. */
export function crownRadiusFromTags(tags: Record<string, string | undefined>): number {
  const d = Number(String(tags.diameter_crown ?? '').replace(/\s*m$/, ''));
  return Number.isFinite(d) && d > 0.5 && d < 40 ? d / 2 : DEFAULT_CROWN_RADIUS_M;
}

/** Crown centres every `spacingM` along a line (at least one). */
export function pointsAlong(line: LonLat[], spacingM = TREE_ROW_SPACING_M): LonLat[] {
  const out: LonLat[] = [];
  let carry = spacingM / 2;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = haversineM(a, b);
    let d = carry;
    while (d <= len) {
      const t = len > 0 ? d / len : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacingM;
    }
    carry = d - len;
  }
  if (!out.length && line.length) out.push(line[0]);
  return out;
}
