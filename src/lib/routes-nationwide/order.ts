/**
 * Which authorities the nationwide runner visits, and in what order
 * (owner, 21.10): paying clients → big cities (≥200k) → regional councils →
 * everyone else (largest first). Only top-level municipal authorities —
 * settlements, neighbourhoods, schools and military units are never route
 * targets of their own.
 */
import { LARGE_CITY_MIN_POPULATION } from '../route-score/quota';

export interface AuthorityRow {
  id: string;
  name: string;
  type: string | null;
  population: number | null;
  isActiveClient: boolean;
  parentAuthorityId: string | null;
}

export type OrderTier = 'client' | 'large_city' | 'regional_council' | 'other';

export const ROUTE_TARGET_TYPES: ReadonlySet<string> = new Set(['city', 'local_council', 'regional_council']);

export function isRouteTarget(a: AuthorityRow): boolean {
  return !!a.type && ROUTE_TARGET_TYPES.has(a.type) && !a.parentAuthorityId;
}

export function orderTier(a: AuthorityRow): OrderTier {
  if (a.isActiveClient) return 'client';
  if (a.type !== 'regional_council' && (a.population ?? 0) >= LARGE_CITY_MIN_POPULATION) return 'large_city';
  if (a.type === 'regional_council') return 'regional_council';
  return 'other';
}

const TIER_RANK: Record<OrderTier, number> = { client: 0, large_city: 1, regional_council: 2, other: 3 };

export function orderAuthorities(all: AuthorityRow[]): Array<AuthorityRow & { tier: OrderTier }> {
  return all
    .filter(isRouteTarget)
    .map((a) => ({ ...a, tier: orderTier(a) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id));
}

export interface AuthorityFilter {
  authorityIds?: string[] | null;
  /** Matches the authority name exactly (after trimming), e.g. "חיפה". */
  cities?: string[] | null;
  kind?: 'municipal' | 'regional' | null;
  limit?: number | null;
}

export function filterAuthorities<T extends AuthorityRow>(rows: T[], f: AuthorityFilter): T[] {
  let out = rows;
  if (f.authorityIds?.length) out = out.filter((a) => f.authorityIds!.includes(a.id));
  if (f.cities?.length) out = out.filter((a) => f.cities!.includes(a.name.trim()));
  if (f.kind === 'regional') out = out.filter((a) => a.type === 'regional_council');
  if (f.kind === 'municipal') out = out.filter((a) => a.type !== 'regional_council');
  if (f.limit && f.limit > 0) out = out.slice(0, f.limit);
  return out;
}
