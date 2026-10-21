/**
 * Authority-by-boundary backfill (RC6 step 1, owner decision 21.10.2026):
 * route docs that carry no authorityId get the authority whose boundary
 * holds the majority of the route's length — reusing dataset-import's
 * assignAuthority (MIN_MAJORITY = 0.5, never a guess below it).
 *
 * axioms §23: authorityId/city lock once set. This planner therefore:
 *   - never touches a doc that already has an authorityId;
 *   - writes `city` only when the doc has none;
 *   - when the doc already has a `city` that does NOT name the resolved
 *     authority, skips it (a human decides) instead of writing an authorityId
 *     that contradicts the city already on the doc.
 * Pure: no I/O. The script reads Firestore and executes the plan.
 */
import { assignAuthority, MIN_MAJORITY, type AuthorityBoundary } from '../dataset-import/authority-assign';
import type { LngLat } from '../dataset-import/types';
import { normalizeAuthorityName } from './admin-match';

export interface BackfillRouteDoc {
  id: string;
  authorityId?: unknown;
  city?: unknown;
  coords: LngLat[];
}

export interface AuthorityUpdate {
  id: string;
  authorityId: string;
  /** Present only when the doc had no city — the exact field-level payload is {authorityId, city?}. */
  city?: string;
  /** City the route is counted under in the report (existing or new). */
  reportCity: string;
  share: number;
}

export type BackfillSkipReason = 'has_authority' | 'no_path' | 'below_majority' | 'city_conflict';

export interface BackfillSkip { id: string; reason: BackfillSkipReason; city: string | null; detail: string }

export interface BackfillPlan { updates: AuthorityUpdate[]; skipped: BackfillSkip[] }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Does an existing `city` string name this authority? (prefix / maqaf / spacing insensitive) */
export function cityMatchesAuthority(city: string, authorityName: string): boolean {
  const a = normalizeAuthorityName(city);
  const b = normalizeAuthorityName(authorityName);
  return !!a && !!b && a === b;
}

export function planAuthorityBackfill(docs: BackfillRouteDoc[], boundaries: AuthorityBoundary[]): BackfillPlan {
  const plan: BackfillPlan = { updates: [], skipped: [] };
  for (const d of docs) {
    const city = str(d.city) || null;
    if (str(d.authorityId)) { plan.skipped.push({ id: d.id, reason: 'has_authority', city, detail: '' }); continue; }
    if (d.coords.length < 2) { plan.skipped.push({ id: d.id, reason: 'no_path', city, detail: `${d.coords.length} point(s)` }); continue; }
    const a = assignAuthority(d.coords, boundaries);
    if (!a.authorityId || !a.name) {
      const top = Object.entries(a.shares).sort((x, y) => y[1] - x[1])[0];
      plan.skipped.push({ id: d.id, reason: 'below_majority', city, detail: `best share ${(a.share * 100).toFixed(0)}% < ${MIN_MAJORITY * 100}%${top ? ` (${top[0]})` : ''}` });
      continue;
    }
    if (city && !cityMatchesAuthority(city, a.name)) {
      plan.skipped.push({ id: d.id, reason: 'city_conflict', city, detail: `boundary says "${a.name}" (${a.authorityId}, ${(a.share * 100).toFixed(0)}%) but doc.city is "${city}"` });
      continue;
    }
    plan.updates.push({ id: d.id, authorityId: a.authorityId, ...(city ? {} : { city: a.name }), reportCity: city ?? a.name, share: a.share });
  }
  return plan;
}

/** Per-city counts for the report: updates by city, skips by reason. */
export function summarizeBackfill(plan: BackfillPlan): { byCity: Record<string, number>; skippedByReason: Record<string, number> } {
  const byCity: Record<string, number> = {};
  for (const u of plan.updates) byCity[u.reportCity] = (byCity[u.reportCity] ?? 0) + 1;
  const skippedByReason: Record<string, number> = {};
  for (const s of plan.skipped) skippedByReason[s.reason] = (skippedByReason[s.reason] ?? 0) + 1;
  return { byCity, skippedByReason };
}

// ── city_registrations.adminRelationId fixes (regional councils whose OSM
// relation name doesn't match the authority name — "הגליל העליון" vs OSM
// "מועצה אזורית גליל עליון"). Owner-verified relation ids, 21.10.2026. ──────

export const KNOWN_ADMIN_RELATION_FIXES: ReadonlyArray<{ authorityName: string; key: string; adminRelationId: number }> = [
  { authorityName: 'הגליל העליון', key: 'hagalil-haelyon', adminRelationId: 1378948 },
  { authorityName: 'הגליל התחתון', key: 'hagalil-hatachton', adminRelationId: 1383754 },
];

export function bboxOfBoundary(g: AuthorityBoundary['geometry']): { latMin: number; lonMin: number; latMax: number; lonMax: number } | null {
  const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  let latMin = Infinity, lonMin = Infinity, latMax = -Infinity, lonMax = -Infinity;
  for (const poly of polys) for (const [lng, lat] of poly?.[0] ?? []) {
    if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat;
    if (lng < lonMin) lonMin = lng; if (lng > lonMax) lonMax = lng;
  }
  if (!Number.isFinite(latMin)) return null;
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return { latMin: r(latMin), lonMin: r(lonMin), latMax: r(latMax), lonMax: r(lonMax) };
}
