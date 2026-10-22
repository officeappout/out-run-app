/**
 * content-common.server — small helpers shared by the route / park / leaderboard tools.
 * No route-collection access here (those reads live in the files on the safety-check
 * reader allowlist).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { readAuthorityRows } from './authority-overview.server';
import { cachedCompute, LIGHT_TOOL_TTL_MS } from './cache.server';
import type { ContentRow } from './content-resolve';
import { toDateLike } from '@/lib/route-score/route-scores-doc';

/** authority id → display name (cached list shared with get_authority_overview). Failure → empty map. */
export async function authorityNameMap(db: Firestore): Promise<Map<string, string>> {
  try {
    const rows = await cachedCompute('authority_rows', LIGHT_TOOL_TTL_MS, () => readAuthorityRows(db));
    return new Map(rows.map((r) => [r.id, r.name]));
  } catch (err) {
    console.error('[admin-analytics/content] authority names unavailable', err);
    return new Map();
  }
}

export interface CandidateOut {
  id: string;
  kind: 'official_route' | 'curated_route' | 'park';
  name: string;
  city: string | null;
  authority: string | null;
  status: string;
}

const KIND: Record<ContentRow['collection'], CandidateOut['kind']> = { official_routes: 'official_route', curated_routes: 'curated_route', parks: 'park' };

export function candidatesOut(rows: ContentRow[], names: Map<string, string>): CandidateOut[] {
  return rows.map((r) => ({
    id: r.id,
    kind: KIND[r.collection],
    name: r.name,
    city: r.city,
    authority: r.authorityId ? names.get(r.authorityId) ?? null : null,
    status: r.status,
  }));
}

export type ContentLookup<T> =
  | { kind: 'resolved'; matchedBy: 'id' | 'name' | 'partial_name'; result: import('./meta').MetricResult<T> }
  | { kind: 'ambiguous'; candidates: CandidateOut[] }
  | { kind: 'none' }
  | { kind: 'unavailable' };

export const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
export const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
/** Timestamp (Admin SDK read) | Date | millis → "YYYY-MM-DD" (UTC), else null. */
export function dayOf(v: unknown): string | null {
  const d = toDateLike(v);
  return d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}
