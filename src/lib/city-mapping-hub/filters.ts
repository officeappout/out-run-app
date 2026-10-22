/**
 * city-mapping-hub/filters.ts — search / filter / sort / KPIs of the hub table
 * (CITY-MAPPING-HUB-DESIGN.md §3.2). Pure.
 *
 * Sorting keeps "not measured" (null) LAST whatever the direction — an
 * unmeasured city must never sort as if it scored 0.
 */
import { normCity } from '../city-inventory/overview';
import type { HubGapKey, HubRow } from './rows';

export type HubLevelFilter = 'all' | 'red' | 'yellow' | 'green' | 'unmeasured';
export type HubQuotaFilter = 'all' | 'below' | 'within' | 'above';
export type HubGapFilter = 'all' | 'pending' | 'contributions' | HubGapKey;

export interface HubFilters {
  q: string;
  level: HubLevelFilter;
  type: 'all' | string;
  gap: HubGapFilter;
  quota: HubQuotaFilter;
  /** true = paying clients only (read of isActiveClient — never written). */
  paying: boolean;
}

export const DEFAULT_HUB_FILTERS: HubFilters = { q: '', level: 'all', type: 'all', gap: 'all', quota: 'all', paying: false };

export const HUB_SORT_KEYS = [
  'name', 'score', 'approvedRoutes', 'pendingRoutes', 'pendingContributions', 'shadeCoveragePct',
  'lightingCoveragePct', 'benchesDensity', 'waterDensity', 'toiletsDensity', 'gaps', 'lastRefreshAt',
] as const;
export type HubSortKey = (typeof HUB_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

/** Free-text key: normCity + lower-case, so "תל-אביב" finds "תל אביב יפו". */
export const searchKey = (s: string) => normCity(s).toLowerCase();

export function quotaBand(r: HubRow): Exclude<HubQuotaFilter, 'all'> {
  if (r.approvedRoutes < r.quota.min) return 'below';
  if (r.approvedRoutes > r.quota.max) return 'above';
  return 'within';
}

export function filterHubRows(rows: HubRow[], f: HubFilters): HubRow[] {
  const q = searchKey(f.q);
  return rows.filter((r) => {
    if (q && !searchKey(r.name).includes(q)) return false;
    if (f.level === 'unmeasured' ? r.measured : f.level !== 'all' && r.level !== f.level) return false;
    if (f.type !== 'all' && r.authorityType !== f.type) return false;
    if (f.quota !== 'all' && quotaBand(r) !== f.quota) return false;
    if (f.paying && !r.isActiveClient) return false;
    if (f.gap === 'pending') return r.pendingRoutes > 0;
    if (f.gap === 'contributions') return r.pendingContributions + r.pendingParks > 0;
    if (f.gap !== 'all' && !r.gaps.includes(f.gap)) return false;
    return true;
  });
}

function sortValue(r: HubRow, key: HubSortKey): string | number | null {
  switch (key) {
    case 'name': return r.name;
    case 'approvedRoutes': return r.approvedRoutes / Math.max(1, r.quota.min);
    case 'gaps': return r.gaps.length;
    default: return r[key];
  }
}

/** Stable; nulls last in both directions. */
export function sortHubRows(rows: HubRow[], key: HubSortKey, dir: SortDir): HubRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = sortValue(x.r, key), b = sortValue(y.r, key);
      if (a == null && b == null) return x.i - y.i;
      if (a == null) return 1;
      if (b == null) return -1;
      const c = typeof a === 'string' ? a.localeCompare(String(b), 'he') : a - (b as number);
      return c ? sign * c : x.i - y.i;
    })
    .map((x) => x.r);
}

export interface HubKpis {
  total: number;
  red: number;
  yellow: number;
  green: number;
  unmeasured: number;
  pendingRoutes: number;
  pendingContributions: number;
}

export function hubKpis(rows: HubRow[]): HubKpis {
  const k: HubKpis = { total: rows.length, red: 0, yellow: 0, green: 0, unmeasured: 0, pendingRoutes: 0, pendingContributions: 0 };
  for (const r of rows) {
    if (r.level) k[r.level]++; else k.unmeasured++;
    k.pendingRoutes += r.pendingRoutes;
    k.pendingContributions += r.pendingContributions + r.pendingParks;
  }
  return k;
}
