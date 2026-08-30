/**
 * scripts/lib/distance-unit-classify.ts — pure, side-effect-free distance-
 * unit classification, shared by scripts/audit-distance-unit-contract.ts
 * (Stage 1, read-only) and scripts/migrate-distance-unit.ts (Stage 2, the
 * write). One source of truth for "what unit is this doc's stored distance
 * actually in" — the migration must classify docs identically to what
 * Stage 1 already reported, not a second, possibly-drifted copy of the
 * same logic. No Firebase imports, no initialization, no top-level
 * execution — safe to import from anywhere with zero side effects.
 */

// Identical to InventoryService's private computePathDistanceMeters
// (inventory.service.ts:113-128) — the SAME ground-truth formula the app
// itself already uses elsewhere, not a new one.
export function computePathDistanceMeters(pathPts: Array<[number, number]>): number {
  if (!pathPts || pathPts.length < 2) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < pathPts.length; i++) {
    const [lng1, lat1] = pathPts[i - 1];
    const [lng2, lat2] = pathPts[i];
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total; // NOT rounded here — rounding happens only at display/comparison time
}

// A stored value is considered a match for a candidate interpretation when
// its relative error is within this fraction. 8% — generous enough to
// absorb path-simplification/rounding drift between whatever originally
// computed the stored value and this script's own Haversine, tight enough
// that km vs meters (a 1000x difference) can never accidentally both match.
export const TOLERANCE = 0.08;
const EPSILON = 0.001; // avoid divide-by-zero on a literal zero-length path

export type Classification = 'canonical-km' | 'needs-conversion-meters-stored' | 'ambiguous-or-corrupt' | 'missing-distance' | 'no-geometry';

export interface DocResult {
  id: string;
  collection: 'official_routes' | 'curated_routes';
  name: string;
  cityLabel: string;
  authorityId: string | null;
  storedDistance: number | null;
  groundTruthMeters: number | null;
  groundTruthKm: number | null;
  classification: Classification;
  proposedNewValue: number | null; // only set for needs-conversion-meters-stored
}

export function classify(storedDistance: unknown, groundTruthMeters: number): { classification: Classification; proposedNewValue: number | null } {
  if (typeof storedDistance !== 'number' || !isFinite(storedDistance)) {
    return { classification: 'missing-distance', proposedNewValue: null };
  }
  const groundTruthKm = groundTruthMeters / 1000;
  const relErrKm = Math.abs(storedDistance - groundTruthKm) / Math.max(groundTruthKm, EPSILON);
  const relErrM = Math.abs(storedDistance - groundTruthMeters) / Math.max(groundTruthMeters, EPSILON);

  const kmMatches = relErrKm <= TOLERANCE;
  const mMatches = relErrM <= TOLERANCE;

  if (kmMatches && (!mMatches || relErrKm <= relErrM)) {
    return { classification: 'canonical-km', proposedNewValue: null };
  }
  if (mMatches) {
    return { classification: 'needs-conversion-meters-stored', proposedNewValue: Math.round(groundTruthKm * 100) / 100 };
  }
  return { classification: 'ambiguous-or-corrupt', proposedNewValue: null };
}

export function cityKey(authorityId: string | undefined, city: string | undefined): string {
  if (authorityId) return `auth:${authorityId}`;
  if (city && city.trim()) return `city:${city.trim()}`;
  return 'unknown';
}

/** [lat,lng]-or-[lng,lat]-agnostic path normalizer: handles both {lat,lng}
 *  object storage and [lng,lat] tuple storage (both exist live — see
 *  route-editor-scoping-spec.md's own PathSchema). Returns [lng,lat] tuples. */
export function normalizePathToLngLatTuples(rawPath: any[]): Array<[number, number]> {
  return rawPath.map((p: any) =>
    Array.isArray(p) ? [Number(p[0]) || 0, Number(p[1]) || 0] : [Number(p.lng) || 0, Number(p.lat) || 0],
  );
}
