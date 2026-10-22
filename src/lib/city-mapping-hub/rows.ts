/**
 * city-mapping-hub/rows.ts — one table row per AUTHORITY for the city-mapping
 * hub (docs/admin/CITY-MAPPING-HUB-DESIGN.md §3.2 / §4.1, owner decision
 * 22.10.2026: the table is based on `authorities`, so every authority shows —
 * one with no `city_inventory` doc is "לא נמדד", never a row of zeros).
 *
 * Pure: the server route reads authorities + city_inventory + route / park /
 * contribution status fields with the Admin SDK and hands them here.
 */
import { quotaForAuthority } from '../route-score/quota';
import { normCity } from '../city-inventory/overview';
import type { CityInventory, ReadinessLevel } from '../city-inventory/types';

/** Authority types that get a city map (municipal only — not units, schools, neighborhoods). */
export const HUB_AUTHORITY_TYPES = ['city', 'local_council', 'regional_council'] as const;
export type HubAuthorityType = (typeof HUB_AUTHORITY_TYPES)[number];

/** Gap codes, in score-weight order (READINESS_WEIGHTS) so the first two are the "top" gaps. */
export const HUB_GAP_KEYS = ['not_measured', 'boundary', 'quota', 'shade', 'layers', 'snapshot', 'density', 'lighting', 'stale'] as const;
export type HubGapKey = (typeof HUB_GAP_KEYS)[number];

export interface HubAuthority {
  id: string;
  name?: string | null;
  type?: string | null;
  population?: number | null;
  isActiveClient?: boolean | null;
  coordinates?: { lat?: unknown; lng?: unknown } | null;
  parentAuthorityId?: string | null;
  tenantType?: string | null;
}

export interface HubRow {
  authorityId: string;
  name: string;
  authorityType: string;
  /** false = no city_inventory doc yet ("לא נמדד"). */
  measured: boolean;
  /** null when not measured. */
  level: ReadinessLevel | null;
  score: number | null;
  approvedRoutes: number;
  /** official_routes published == false and not archived / rejected. */
  pendingRoutes: number;
  /** parks published == false and not draft / rejected (the approval center's "מיקומים"). */
  pendingParks: number;
  /** user_contributions status == pending. */
  pendingContributions: number;
  quota: { min: number; max: number };
  shadeCoveragePct: number | null;
  lightingCoveragePct: number | null;
  /** Per km of street; null = not measured. */
  benchesDensity: number | null;
  waterDensity: number | null;
  toiletsDensity: number | null;
  /** Every gap, weight order. */
  gaps: HubGapKey[];
  /** Read only — never written from the hub (axioms §6). */
  isActiveClient: boolean;
  population: number | null;
  center: { lat: number; lng: number } | null;
  lastRefreshAt: string | null;
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Municipal, top-level authority. `parentAuthorityId` is checked as "a
 * non-empty string" — absent and null both mean top-level (axioms §33: never
 * rely on `== null` matching an absent field).
 */
export function isHubAuthority(a: HubAuthority): boolean {
  if (!(HUB_AUTHORITY_TYPES as readonly string[]).includes(String(a.type ?? ''))) return false;
  if (typeof a.parentAuthorityId === 'string' && a.parentAuthorityId.trim()) return false;
  if (a.tenantType != null && a.tenantType !== 'municipal') return false;
  return true;
}

export function centerOf(a: HubAuthority): { lat: number; lng: number } | null {
  const lat = finite(a.coordinates?.lat);
  const lng = finite(a.coordinates?.lng);
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  if (lat < 29 || lat > 34 || lng < 33.5 || lng > 36.5) return null; // outside Israel ⇒ bad data, not a point
  return { lat, lng };
}

/** name → authority id for legacy docs that only carry `city` (156 / 183 official_routes, 16.08). */
export function buildCityToAuthority(authorities: HubAuthority[], inventories: CityInventory[]): Map<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const a of authorities) if (a.name) pairs.push([normCity(a.name), a.id]);
  for (const i of inventories) if (i.city) pairs.push([normCity(i.city), i.authorityId]);
  return new Map(pairs.filter(([k]) => k));
}

/** Count docs per authority: by authorityId, else (legacy) by city name. */
export function countByAuthority(docs: Array<{ authorityId?: unknown; city?: unknown }>, cityToAuthority: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of docs) {
    const id = typeof d.authorityId === 'string' && d.authorityId
      ? d.authorityId
      : cityToAuthority.get(normCity(typeof d.city === 'string' ? d.city : ''));
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** The approval center's pending-route rule: unpublished and not archived / rejected. */
export function isPendingRoute(d: { published?: unknown; status?: unknown }): boolean {
  return d.published !== true && d.status !== 'archived' && d.status !== 'rejected';
}

/** The approval center's pending-park rule: unpublished and not draft / rejected. */
export function isPendingPark(d: { published?: unknown; contentStatus?: unknown }): boolean {
  return d.published !== true && d.contentStatus !== 'draft' && d.contentStatus !== 'rejected';
}

export function hubGaps(inv: CityInventory | null, approvedRoutes: number, quotaMin: number): HubGapKey[] {
  if (!inv) return ['not_measured'];
  const g = new Set<HubGapKey>();
  const blockers = inv.readiness.blockers ?? [];
  if (blockers.some((b) => b.startsWith('no authority boundary'))) g.add('boundary');
  if (approvedRoutes < quotaMin) g.add('quota');
  if (inv.readiness.missing.includes('shade')) g.add('shade');
  if (blockers.some((b) => b.startsWith('OSM layers not measured'))) g.add('layers');
  if (blockers.some((b) => b.startsWith('no OSM snapshot'))) g.add('snapshot');
  if (blockers.some((b) => b.startsWith('below expected density'))) g.add('density');
  if (inv.layers.lighting?.coveragePct == null) g.add('lighting');
  if (Object.values(inv.layers).some((l) => l?.quality?.includes('stale_source'))) g.add('stale');
  return HUB_GAP_KEYS.filter((k) => g.has(k));
}

export interface BuildHubRowsInput {
  authorities: HubAuthority[];
  inventories: CityInventory[];
  approved: Map<string, number>;
  pendingRoutes: Map<string, number>;
  pendingParks: Map<string, number>;
  pendingContributions: Map<string, number>;
}

/**
 * Every municipal authority + every authority that has an inventory doc
 * (even if its type would filter it out — a measured city must never vanish).
 */
export function buildHubRows(input: BuildHubRowsInput): HubRow[] {
  const invById = new Map(input.inventories.map((i) => [i.authorityId, i]));
  const authById = new Map(input.authorities.map((a) => [a.id, a]));
  const ids = new Set<string>();
  for (const a of input.authorities) if (isHubAuthority(a)) ids.add(a.id);
  for (const i of input.inventories) ids.add(i.authorityId);

  return Array.from(ids).map((id) => {
    const a: HubAuthority = authById.get(id) ?? { id };
    const inv = invById.get(id) ?? null;
    const type = inv?.authorityType ?? (typeof a.type === 'string' && a.type ? a.type : 'city');
    const q = quotaForAuthority({ type: a.type ?? type, population: finite(a.population) });
    const approvedRoutes = input.approved.get(id) ?? 0;
    const refreshed = inv ? inv.updatedAt ?? inv.snapshot.builtAt ?? null : null;
    return {
      authorityId: id,
      name: (typeof a.name === 'string' && a.name.trim()) || inv?.city || id,
      authorityType: type,
      measured: inv !== null,
      level: inv ? inv.readiness.level : null,
      score: inv ? inv.readiness.score : null,
      approvedRoutes,
      pendingRoutes: input.pendingRoutes.get(id) ?? 0,
      pendingParks: input.pendingParks.get(id) ?? 0,
      pendingContributions: input.pendingContributions.get(id) ?? 0,
      quota: { min: q.total.min, max: q.total.max },
      shadeCoveragePct: inv?.layers.shade?.coveragePct ?? null,
      lightingCoveragePct: inv?.layers.lighting?.coveragePct ?? null,
      benchesDensity: inv?.layers.benches?.density ?? null,
      waterDensity: inv?.layers.drinking_water?.density ?? null,
      toiletsDensity: inv?.layers.toilets?.density ?? null,
      gaps: hubGaps(inv, approvedRoutes, q.total.min),
      isActiveClient: a.isActiveClient === true,
      population: finite(a.population),
      center: centerOf(a),
      lastRefreshAt: refreshed && Number.isFinite(refreshed.getTime()) ? refreshed.toISOString() : null,
    };
  });
}

/** Wire → row; every field re-guarded (the client never trusts the JSON shape). */
export function parseHubRow(o: unknown): HubRow | null {
  const r = o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  if (!r || typeof r.authorityId !== 'string' || !r.authorityId) return null;
  const q = (r.quota && typeof r.quota === 'object' ? r.quota : {}) as Record<string, unknown>;
  const c = (r.center && typeof r.center === 'object' ? r.center : null) as Record<string, unknown> | null;
  const lat = finite(c?.lat), lng = finite(c?.lng);
  const measured = r.measured === true;
  const level = measured && (r.level === 'green' || r.level === 'yellow' || r.level === 'red') ? r.level : null;
  return {
    authorityId: r.authorityId,
    name: typeof r.name === 'string' && r.name ? r.name : r.authorityId,
    authorityType: typeof r.authorityType === 'string' ? r.authorityType : 'city',
    measured,
    level,
    score: measured ? finite(r.score) : null,
    approvedRoutes: finite(r.approvedRoutes) ?? 0,
    pendingRoutes: finite(r.pendingRoutes) ?? 0,
    pendingParks: finite(r.pendingParks) ?? 0,
    pendingContributions: finite(r.pendingContributions) ?? 0,
    quota: { min: finite(q.min) ?? 0, max: finite(q.max) ?? 0 },
    shadeCoveragePct: finite(r.shadeCoveragePct),
    lightingCoveragePct: finite(r.lightingCoveragePct),
    benchesDensity: finite(r.benchesDensity),
    waterDensity: finite(r.waterDensity),
    toiletsDensity: finite(r.toiletsDensity),
    gaps: Array.isArray(r.gaps) ? r.gaps.filter((g): g is HubGapKey => (HUB_GAP_KEYS as readonly unknown[]).includes(g)) : [],
    isActiveClient: r.isActiveClient === true,
    population: finite(r.population),
    center: lat != null && lng != null ? { lat, lng } : null,
    lastRefreshAt: typeof r.lastRefreshAt === 'string' ? r.lastRefreshAt : null,
  };
}
