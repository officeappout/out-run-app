/**
 * authority-compare.server — side-by-side table of 2–5 authorities, for compare_authorities.
 * The numbers are EXACTLY get_authority_overview's: this file calls computeAuthorityOverview
 * (authority-overview.server.ts) per authority and only reshapes the result into a table —
 * no second copy of any count rule. READ-ONLY (isActiveClient reported, never written — §6).
 * A name that is ambiguous or unknown stops the whole call before any overview read: the
 * admin is asked, never guessed for.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import {
  AUTHORITY_OVERVIEW_CAVEATS,
  computeAuthorityOverview,
  readAuthorityRows,
  resolveAuthorityQuery,
  type AuthorityOverview,
  type AuthorityRow,
} from './authority-overview.server';
import { cachedCompute, LIGHT_TOOL_TTL_MS } from './cache.server';
import { metaOf, type MetricResult } from './meta';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

export interface CandidateRow {
  id: string;
  name: string;
  type: string | null;
  tenantType: string | null;
}

export type OneAuthority =
  | { kind: 'resolved'; row: AuthorityRow; matchedBy: 'id' | 'name' | 'partial_name' }
  | { kind: 'ambiguous'; candidates: CandidateRow[] }
  | { kind: 'none' };

/** The shared name→authority step (cached name list, same resolver as get_authority_overview). */
export async function resolveOneAuthority(db: Firestore, query: string): Promise<OneAuthority> {
  const rows = await cachedCompute('authority_rows', LIGHT_TOOL_TTL_MS, () => readAuthorityRows(db));
  const r = resolveAuthorityQuery(query, rows);
  if (r.kind === 'ambiguous') {
    return { kind: 'ambiguous', candidates: r.candidates.map((c) => ({ id: c.id, name: c.name, type: c.type, tenantType: c.tenantType })) };
  }
  return r;
}

export interface CompareTableRow {
  metric: string;
  /** one cell per authority, in the same order as `authorities`; null = could not be counted */
  values: Array<string | number | boolean | null>;
}

export interface AuthorityComparison {
  authorities: Array<{ id: string; name: string; type: string | null }>;
  table: CompareTableRow[];
}

/** Pure: overviews → table. Missing counts stay null (never 0). */
export function buildComparisonTable(overviews: AuthorityOverview[]): AuthorityComparison {
  const row = (metric: string, pick: (o: AuthorityOverview) => string | number | boolean | null): CompareTableRow => ({ metric, values: overviews.map(pick) });
  return {
    authorities: overviews.map((o) => ({ id: o.authority.id, name: o.authority.name, type: o.authority.type })),
    table: [
      row('crm_status', (o) => o.authority.pipelineLabel ?? o.authority.pipelineStatus),
      row('is_active_client', (o) => o.authority.isActiveClient),
      row('population', (o) => o.authority.population),
      row('mapping_level', (o) => (o.inventory ? o.inventory.readinessLevel : o.inventoryStatus)),
      row('mapping_score', (o) => (o.inventory ? o.inventory.readinessScore : null)),
      row('routes_published', (o) => o.routes.published),
      row('routes_pending', (o) => o.routes.pending),
      row('parks_published', (o) => o.parks.published),
      row('parks_pending', (o) => o.parks.pending),
      // '<5' stays a string: the privacy mask of the single-authority tool applies here too
      row('users', (o) => o.users),
    ],
  };
}

export type CompareLookup =
  | { kind: 'resolved'; result: MetricResult<AuthorityComparison> }
  | { kind: 'unresolved'; problems: Array<{ query: string; problem: 'ambiguous' | 'none'; candidates: CandidateRow[] }> }
  | { kind: 'too_few'; note: string }
  | { kind: 'unavailable' };

export async function compareAuthorities(db: Firestore, queries: string[], opts: { now?: Date } = {}): Promise<CompareLookup> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  const resolved: AuthorityRow[] = [];
  const problems: Array<{ query: string; problem: 'ambiguous' | 'none'; candidates: CandidateRow[] }> = [];
  try {
    for (const q of queries) {
      const r = await resolveOneAuthority(db, q);
      if (r.kind === 'resolved') {
        if (!resolved.some((x) => x.id === r.row.id)) resolved.push(r.row);
      } else {
        problems.push({ query: q, problem: r.kind, candidates: r.kind === 'ambiguous' ? r.candidates : [] });
      }
    }
  } catch (err) {
    console.error('[admin-analytics/authority-compare] resolve failed', err);
    return { kind: 'unavailable' };
  }
  if (problems.length) return { kind: 'unresolved', problems };
  if (resolved.length < COMPARE_MIN) return { kind: 'too_few', note: 'the names resolve to fewer than 2 different authorities — nothing to compare' };

  try {
    const overviews = await Promise.all(resolved.map((r) => computeAuthorityOverview(db, r.id)));
    const ok = overviews.filter((o): o is AuthorityOverview => o !== null);
    if (ok.length < COMPARE_MIN) return { kind: 'unavailable' };
    const failed = ok.flatMap((o) => o.failed.map((f) => `${o.authority.name} · ${f}: could not be counted (not zero)`));
    return {
      kind: 'resolved',
      result: {
        value: buildComparisonTable(ok),
        meta: metaOf('authority_compare', { from: null, to: today }, { caveats: [...AUTHORITY_OVERVIEW_CAVEATS, ...failed] }),
      },
    };
  } catch (err) {
    console.error('[admin-analytics/authority-compare] compare failed', err);
    return { kind: 'unavailable' };
  }
}
