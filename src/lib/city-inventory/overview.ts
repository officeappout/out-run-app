/**
 * "All cities" overview rows for /admin/city-mapping (RC8 step 5). Pure:
 * the server route reads city_inventory + authorities + published routes with
 * the Admin SDK and hands them here. "Not measured" stays null (never 0).
 */
import { quotaForAuthority } from '../route-score/quota';
import type { CityInventory, ReadinessLevel } from './types';

export interface CityOverviewRow {
  authorityId: string;
  city: string;
  authorityType: string;
  level: ReadinessLevel;
  score: number;
  /** published === true routes of the authority (by authorityId, or legacy by city name). */
  approvedRoutes: number;
  quota: { min: number; max: number };
  /** Source key of the shade layer (technion_shade / canopy_estimate …); null = no shade layer. */
  shadeSource: string | null;
  shadeCoveragePct: number | null;
  lightingCoveragePct: number | null;
  /** ISO — the doc's server write time, else the run's build time. */
  lastRefreshAt: string | null;
}

export interface OverviewAuthority { name?: string | null; type?: string | null; population?: number | null }

export const normCity = (s: string | null | undefined) => String(s ?? '').replace(/[\s\-–־]+/g, ' ').trim();

/** Approved counts per authority id: by authorityId, plus legacy docs with no authorityId matched by city name. */
export function countApprovedByAuthority(routes: Array<{ authorityId?: unknown; city?: unknown }>, cityToAuthority: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of routes) {
    const id = typeof r.authorityId === 'string' && r.authorityId ? r.authorityId : cityToAuthority.get(normCity(typeof r.city === 'string' ? r.city : ''));
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

export function buildCityOverviewRows(inventories: CityInventory[], authorities: Map<string, OverviewAuthority>, approved: Map<string, number>): CityOverviewRow[] {
  return inventories.map((inv) => {
    const a = authorities.get(inv.authorityId) ?? {};
    const q = quotaForAuthority({ type: a.type ?? inv.authorityType, population: a.population ?? null });
    const shade = inv.layers.shade;
    const lighting = inv.layers.lighting;
    const refreshed = inv.updatedAt ?? inv.snapshot.builtAt ?? null;
    return {
      authorityId: inv.authorityId,
      city: inv.city || String(a.name ?? inv.authorityId),
      authorityType: inv.authorityType,
      level: inv.readiness.level,
      score: inv.readiness.score,
      approvedRoutes: approved.get(inv.authorityId) ?? 0,
      quota: { min: q.total.min, max: q.total.max },
      shadeSource: shade?.sources?.[0]?.key ?? shade?.method ?? null,
      shadeCoveragePct: shade?.coveragePct ?? null,
      lightingCoveragePct: lighting?.coveragePct ?? null,
      lastRefreshAt: refreshed ? refreshed.toISOString() : null,
    };
  });
}

export type OverviewSortKey = 'city' | 'score' | 'approvedRoutes' | 'shadeCoveragePct' | 'lightingCoveragePct' | 'lastRefreshAt';

/** Stable sort; nulls always last whatever the direction. */
export function sortCityOverviewRows(rows: CityOverviewRow[], key: OverviewSortKey, dir: 'asc' | 'desc'): CityOverviewRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const val = (r: CityOverviewRow): string | number | null => (key === 'approvedRoutes' ? r.approvedRoutes / Math.max(1, r.quota.min) : r[key]);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = val(x.r), b = val(y.r);
      if (a == null && b == null) return x.i - y.i;
      if (a == null) return 1;
      if (b == null) return -1;
      const c = typeof a === 'string' ? a.localeCompare(String(b), 'he') : a - (b as number);
      return c ? sign * c : x.i - y.i;
    })
    .map((x) => x.r);
}

/** Wire → row, every field re-guarded (the client never trusts the JSON shape). */
export function parseCityOverviewRow(o: unknown): CityOverviewRow | null {
  const r = o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  if (!r || typeof r.authorityId !== 'string' || !r.authorityId) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const level = r.level === 'green' || r.level === 'yellow' || r.level === 'red' ? r.level : 'red';
  const q = (r.quota && typeof r.quota === 'object' ? r.quota : {}) as Record<string, unknown>;
  return {
    authorityId: r.authorityId,
    city: typeof r.city === 'string' ? r.city : r.authorityId,
    authorityType: typeof r.authorityType === 'string' ? r.authorityType : 'city',
    level,
    score: num(r.score) ?? 0,
    approvedRoutes: num(r.approvedRoutes) ?? 0,
    quota: { min: num(q.min) ?? 0, max: num(q.max) ?? 0 },
    shadeSource: typeof r.shadeSource === 'string' ? r.shadeSource : null,
    shadeCoveragePct: num(r.shadeCoveragePct),
    lightingCoveragePct: num(r.lightingCoveragePct),
    lastRefreshAt: typeof r.lastRefreshAt === 'string' ? r.lastRefreshAt : null,
  };
}
