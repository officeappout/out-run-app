/**
 * authority-ranking.server — top/bottom N authorities by one metric, for get_authorities_ranking.
 *
 * Cheapest real sources (checked against production 22.10.2026: 2769 authorities of which only
 * 264 are city/local/regional; users 895, official_routes 466, parks 1159, city_inventory 248):
 *   users          ONE projection scan of users (core.authorityId only), grouped in memory.
 *                  authorities.userCount is NOT used — it is a stale denormalization (TLV: 44
 *                  stored vs 245 real).
 *   routes         ONE projection scan of official_routes (authorityId, published) → published count
 *   parks          ONE projection scan of parks (authorityId, published) → published count
 *   mapping_score  city_inventory.readiness.score (the stored value; only mapped cities rank)
 *   crm_stage      authorities.pipelineStatus (missing = lead; draft = database only, excluded)
 * Instead of 264 authorities × several count() queries. Results cached 10 min (read-only
 * aggregate for an answer — never an input to a write or a permission).
 * A failed scan → null (the tool says "could not be computed"), never an empty/zero ranking.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { CITY_INVENTORY_COLLECTION } from '@/lib/city-inventory/types';
import { readCityInventoryDoc } from '@/lib/city-inventory/doc';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@/types/admin-types';
import { authorityNameOf } from './authority-names.server';
import { cachedCompute, HEAVY_TOOL_TTL_MS } from './cache.server';
import { PIPELINE_ORDER } from './crm-pipeline.server';
import { maskSmall, metaOf, type MetricResult } from './meta';

export const RANKING_METRICS = ['users', 'routes', 'parks', 'mapping_score', 'crm_stage'] as const;
export type RankingMetric = (typeof RANKING_METRICS)[number];
export const RANKING_KINDS = ['city', 'regional', 'any'] as const;
export type RankingKind = (typeof RANKING_KINDS)[number];
export type RankingDirection = 'top' | 'bottom';
export const RANKING_DEFAULT_LIMIT = 10;
export const RANKING_MAX_LIMIT = 20;

/** city = city + local council; regional = regional council; any = the three. Never neighborhoods/settlements/units. */
const TYPES_OF_KIND: Record<RankingKind, string[]> = {
  city: ['city', 'local_council'],
  regional: ['regional_council'],
  any: ['city', 'local_council', 'regional_council'],
};

export interface RankingAuthority {
  id: string;
  name: string;
  type: string;
  pipelineStatus: string;
}

export interface RankingRow {
  rank: number;
  id: string;
  name: string;
  type: string;
  /** users: '<5' when small. crm_stage: 1 (lead) … 7 (upsell) position in the pipeline */
  value: number | '<5';
  label?: string;
}

export interface AuthorityRanking {
  by: RankingMetric;
  direction: RankingDirection;
  kind: RankingKind;
  /** authorities of this kind that the metric applies to (the ranked universe) */
  ranked: number;
  /** eligible authorities left out because they have no value (e.g. never mapped) */
  withoutValue: number;
  rows: RankingRow[];
}

const strOr = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

async function readEligible(db: Firestore): Promise<RankingAuthority[]> {
  const snap = await db.collection('authorities').select('name', 'type', 'pipelineStatus', 'isDemo').get();
  const out: RankingAuthority[] = [];
  for (const d of snap.docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    if (x.isDemo === true) continue;
    const type = typeof x.type === 'string' ? x.type : '';
    if (!TYPES_OF_KIND.any.includes(type)) continue;
    out.push({ id: d.id, name: authorityNameOf(x.name) ?? d.id, type, pipelineStatus: strOr(x.pipelineStatus, 'lead') });
  }
  return out;
}

async function groupCount(db: Firestore, collection: string, field: 'authorityId' | 'core.authorityId', onlyPublished: boolean): Promise<Map<string, number>> {
  const snap = await (onlyPublished ? db.collection(collection).select('authorityId', 'published') : db.collection(collection).select(field)).get();
  const m = new Map<string, number>();
  for (const d of snap.docs) {
    const x = (d.data() ?? {}) as Record<string, any>;
    if (onlyPublished && x.published !== true) continue;
    const id = field === 'core.authorityId' ? x.core?.authorityId : x.authorityId;
    if (typeof id === 'string' && id) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

async function readMappingScores(db: Firestore): Promise<Map<string, { score: number; level: string }>> {
  const snap = await db.collection(CITY_INVENTORY_COLLECTION).select('authorityId', 'readiness').get();
  const m = new Map<string, { score: number; level: string }>();
  for (const d of snap.docs) {
    const inv = readCityInventoryDoc(d.id, d.data());
    if (inv) m.set(inv.authorityId, { score: Math.round(inv.readiness.score), level: inv.readiness.level });
  }
  return m;
}

/** Pure: sort + cut. Ties broken by name so the order is stable. */
export function rankRows(
  items: Array<{ a: RankingAuthority; value: number; label?: string }>,
  direction: RankingDirection,
  limit: number,
  by: RankingMetric,
): RankingRow[] {
  const sorted = [...items].sort((x, y) => (direction === 'top' ? y.value - x.value : x.value - y.value) || x.a.name.localeCompare(y.a.name, 'he'));
  return sorted.slice(0, limit).map((it, i) => ({
    rank: i + 1,
    id: it.a.id,
    name: it.a.name,
    type: it.a.type,
    value: by === 'users' ? maskSmall(it.value) : it.value,
    ...(it.label ? { label: it.label } : {}),
  }));
}

export async function computeAuthorityRanking(
  db: Firestore,
  args: { by: RankingMetric; kind: RankingKind; direction: RankingDirection; limit: number },
): Promise<AuthorityRanking> {
  const { by, kind, direction } = args;
  const limit = Math.min(Math.max(1, args.limit), RANKING_MAX_LIMIT);
  const eligible = (await cachedCompute('ranking_authorities', HEAVY_TOOL_TTL_MS, () => readEligible(db))).filter((a) => TYPES_OF_KIND[kind].includes(a.type));

  let items: Array<{ a: RankingAuthority; value: number; label?: string }>;
  if (by === 'users') {
    const m = await cachedCompute('ranking_users', HEAVY_TOOL_TTL_MS, () => groupCount(db, 'users', 'core.authorityId', false));
    items = eligible.map((a) => ({ a, value: m.get(a.id) ?? 0 }));
  } else if (by === 'routes' || by === 'parks') {
    const coll = by === 'routes' ? 'official_routes' : 'parks';
    const m = await cachedCompute(`ranking_${coll}`, HEAVY_TOOL_TTL_MS, () => groupCount(db, coll, 'authorityId', true));
    items = eligible.map((a) => ({ a, value: m.get(a.id) ?? 0 }));
  } else if (by === 'mapping_score') {
    const m = await cachedCompute('ranking_inventory', HEAVY_TOOL_TTL_MS, () => readMappingScores(db));
    items = eligible.flatMap((a) => {
      const s = m.get(a.id);
      return s ? [{ a, value: s.score, label: s.level }] : [];
    });
  } else {
    items = eligible.flatMap((a) => {
      const idx = PIPELINE_ORDER.indexOf(a.pipelineStatus as PipelineStatus);
      // draft = database-only entity, not pipeline; unknown / 'demo' values are not ranked
      if (idx < 1) return [];
      return [{ a, value: idx, label: PIPELINE_STATUS_LABELS[a.pipelineStatus as PipelineStatus] }];
    });
  }
  return { by, direction, kind, ranked: items.length, withoutValue: eligible.length - items.length, rows: rankRows(items, direction, limit, by) };
}

export const RANKING_CAVEATS: Record<RankingMetric, string[]> = {
  users: ['users are counted at the exact authority they registered under (core.authorityId) — neighborhood/settlement users do not roll up into a city or council'],
  routes: ['published official routes by authorityId only; routes linked by name alone are not counted; connectors are included'],
  parks: ['published parks by authorityId only'],
  mapping_score: ['stored city_inventory readiness score (0-100); authorities never mapped have no score and are not ranked'],
  crm_stage: ['crm_stage value = position in the pipeline (lead 1 … upsell 7, draft excluded as database-only); stored pipelineStatus, missing = lead'],
};

export async function getAuthoritiesRanking(
  db: Firestore,
  args: { by: RankingMetric; kind: RankingKind | null; direction: RankingDirection | null; limit: number | null },
  opts: { now?: Date } = {},
): Promise<MetricResult<AuthorityRanking>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  const meta = (extra: Parameters<typeof metaOf>[2] = {}) => metaOf('authorities_ranking', { from: null, to: today }, extra);
  try {
    const value = await computeAuthorityRanking(db, {
      by: args.by,
      kind: args.kind ?? 'any',
      direction: args.direction ?? 'top',
      limit: args.limit ?? RANKING_DEFAULT_LIMIT,
    });
    return {
      value,
      meta: meta({ n: value.ranked, caveats: [...RANKING_CAVEATS[args.by], 'only city / local council / regional council authorities are ranked; demo authorities are excluded'] }),
    };
  } catch (err) {
    console.error('[admin-analytics/authority-ranking] failed', err);
    return { value: null, meta: meta(), error: 'ranking could not be computed' };
  }
}
