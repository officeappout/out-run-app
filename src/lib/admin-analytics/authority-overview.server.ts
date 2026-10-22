/**
 * authority-overview.server — everything the admin assistant can say about ONE authority
 * (city / local council / regional council), for the get_authority_overview tool.
 *
 *   resolveAuthorityQuery(query, rows)   pure: id → exact normalized name → unique partial
 *                                        match; several hits → candidates, never a guess
 *   computeAuthorityOverview(db, id)     Admin SDK reads, READ-ONLY:
 *     authorities/{id}        name, type, pipelineStatus (missing = lead), isActiveClient
 *                             (reported only — never written, axiom §6), population
 *     city_inventory/{id}     compact layer summary + stored readiness (readCityInventoryDoc,
 *                             Timestamp-safe — axiom §31)
 *     official_routes         count() by authorityId: total / published / unpublished /
 *                             archived / rejected / connectors (equality filters only — no
 *                             composite index needed); pending = unpublished − archived −
 *                             rejected (the approval center's rule, isPendingRoute)
 *     parks                   count() by authorityId: total / published / pending (unpublished − draft
 *                             − rejected, isPendingPark)
 *     users                   count() where core.authorityId == id (aggregate only, <5 masked)
 * Every count fails on its own → null ("could not be counted"), never 0.
 *
 * Listed in scripts/safety-check.sh's AUTHORIZED_ROUTE_WRITERS + MIGRATED list as a READER
 * (same as pending-approvals.server.ts): there is no write verb in this file.
 */
import 'server-only';
import type { Firestore, Query } from 'firebase-admin/firestore';
import { normalizeAuthorityName } from '@/lib/routes-nationwide/admin-match';
import { CITY_INVENTORY_COLLECTION, INVENTORY_LAYER_KEYS, type InventoryLayerKey } from '@/lib/city-inventory/types';
import { readCityInventoryDoc } from '@/lib/city-inventory/doc';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@/types/admin-types';
import { authorityNameOf } from './authority-names.server';
import { getIsraelDateKey } from '@/lib/israelTime';
import { cachedCompute, LIGHT_TOOL_TTL_MS } from './cache.server';
import { maskSmall, metaOf, type MetricResult } from './meta';

export const AUTHORITY_CANDIDATES_MAX = 5;

export interface AuthorityRow {
  id: string;
  /** every display name the doc carries (he, en, plain string) */
  names: string[];
  name: string;
  type: string | null;
  tenantType: string | null;
}

export type AuthorityResolution =
  | { kind: 'resolved'; row: AuthorityRow; matchedBy: 'id' | 'name' | 'partial_name' }
  | { kind: 'ambiguous'; candidates: AuthorityRow[] }
  | { kind: 'none' };

function namesOf(raw: unknown): string[] {
  const out: string[] = [];
  if (typeof raw === 'string' && raw.trim()) out.push(raw.trim());
  else if (raw && typeof raw === 'object') {
    for (const v of Object.values(raw as Record<string, unknown>)) if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  return out;
}

export function toAuthorityRow(id: string, data: Record<string, unknown>): AuthorityRow {
  const names = namesOf(data.name);
  return {
    id,
    names,
    name: authorityNameOf(data.name) ?? id,
    type: typeof data.type === 'string' ? data.type : null,
    tenantType: typeof data.tenantType === 'string' ? data.tenantType : null,
  };
}

/** "הגלבוע" ↔ "גלבוע": the key plus its with/without-leading-ה twin (as matchAdminRelation). */
function keysOf(s: string): string[] {
  const k = normalizeAuthorityName(s);
  if (!k) return [];
  return [k, k.startsWith('ה') ? k.slice(1) : `ה${k}`].filter(Boolean);
}

/** Pure. Exact id → exact normalized name → a UNIQUE partial name match; else candidates. */
export function resolveAuthorityQuery(query: string, rows: AuthorityRow[]): AuthorityResolution {
  const q = query.trim();
  if (!q) return { kind: 'none' };
  const byId = rows.find((r) => r.id === q);
  if (byId) return { kind: 'resolved', row: byId, matchedBy: 'id' };

  const qKeys = keysOf(q);
  if (!qKeys.length) return { kind: 'none' };
  const exact = rows.filter((r) => r.names.some((n) => keysOf(n).some((k) => qKeys.includes(k))));
  if (exact.length === 1) return { kind: 'resolved', row: exact[0], matchedBy: 'name' };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact.slice(0, AUTHORITY_CANDIDATES_MAX) };

  const qk = qKeys[0];
  if (qk.length < 2) return { kind: 'none' };
  const partial = rows.filter((r) =>
    r.names.some((n) => {
      const k = normalizeAuthorityName(n);
      return k.length >= 2 && (k.includes(qk) || qk.includes(k));
    }),
  );
  if (partial.length === 1) return { kind: 'resolved', row: partial[0], matchedBy: 'partial_name' };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial.slice(0, AUTHORITY_CANDIDATES_MAX) };
  return { kind: 'none' };
}

export async function readAuthorityRows(db: Firestore): Promise<AuthorityRow[]> {
  const snap = await db.collection('authorities').select('name', 'type', 'tenantType').get();
  return snap.docs.map((d) => toAuthorityRow(d.id, (d.data() ?? {}) as Record<string, unknown>));
}

// ── the overview ──────────────────────────────────────────────────────────

export interface CompactLayer {
  count?: number;
  km?: number;
  pct?: number;
}

export interface AuthorityOverview {
  authority: {
    id: string;
    name: string;
    type: string | null;
    tenantType: string | null;
    pipelineStatus: string;
    pipelineLabel: string | null;
    /** READ-ONLY report of the stored flag (axiom §6) */
    isActiveClient: boolean;
    population: number | null;
    parentAuthorityId: string | null;
  };
  /** null = this authority has no city_inventory doc (never mapped), or it could not be read */
  inventory: {
    readinessLevel: string;
    readinessScore: number;
    missingLayers: InventoryLayerKey[];
    blockers: string[];
    areaKm2: number | null;
    osmSnapshotDate: string | null;
    updatedAt: string | null;
    /** only measured layers; count / km (length or area) / pct (coverage) */
    layers: Partial<Record<InventoryLayerKey, CompactLayer>>;
  } | null;
  inventoryStatus: 'ok' | 'not_mapped' | 'unreadable';
  /** null = could not be counted (NOT zero) */
  routes: {
    total: number | null;
    published: number | null;
    pending: number | null;
    archived: number | null;
    rejected: number | null;
    connectors: number | null;
    /** docs with no `published` field at all (live for users, invisible to published==false) */
    noPublishField: number | null;
  };
  parks: { total: number | null; published: number | null; pending: number | null };
  /** users whose core.authorityId is this authority; '<5' when small */
  users: number | '<5' | null;
  failed: string[];
}

type Where = [string, unknown];

async function countWhere(db: Firestore, collection: string, wheres: Where[]): Promise<number> {
  let q: Query = db.collection(collection);
  for (const [field, value] of wheres) q = q.where(field, '==', value);
  const snap = await q.count().get();
  return snap.data().count;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function compactLayers(inv: NonNullable<ReturnType<typeof readCityInventoryDoc>>): Partial<Record<InventoryLayerKey, CompactLayer>> {
  const out: Partial<Record<InventoryLayerKey, CompactLayer>> = {};
  for (const key of INVENTORY_LAYER_KEYS) {
    const l = inv.layers[key];
    const c: CompactLayer = {};
    if (l.count !== null) c.count = l.count;
    const km = l.lengthKm ?? l.areaKm2;
    if (km !== null) c.km = round1(km);
    if (l.coveragePct !== null) c.pct = Math.round(l.coveragePct);
    if (Object.keys(c).length) out[key] = c;
  }
  return out;
}

export async function computeAuthorityOverview(db: Firestore, authorityId: string): Promise<AuthorityOverview | null> {
  const authSnap = await db.collection('authorities').doc(authorityId).get();
  if (!authSnap.exists) return null;
  const a = (authSnap.data() ?? {}) as Record<string, unknown>;
  const failed: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[admin-analytics/authority-overview] ${label} failed:`, err);
      failed.push(label);
      return null;
    }
  };
  const byAuth: Where = ['authorityId', authorityId];

  const [invSnap, rTotal, rPub, rUnpub, rArchUnpub, rRejUnpub, rArch, rRej, rConn, pTotal, pPub, pUnpub, pDraft, pRej, users] = await Promise.all([
    safe('inventory', () => db.collection(CITY_INVENTORY_COLLECTION).doc(authorityId).get()),
    safe('routes.total', () => countWhere(db, 'official_routes', [byAuth])),
    safe('routes.published', () => countWhere(db, 'official_routes', [byAuth, ['published', true]])),
    safe('routes.unpublished', () => countWhere(db, 'official_routes', [byAuth, ['published', false]])),
    safe('routes.unpublished_archived', () => countWhere(db, 'official_routes', [byAuth, ['published', false], ['status', 'archived']])),
    safe('routes.unpublished_rejected', () => countWhere(db, 'official_routes', [byAuth, ['published', false], ['status', 'rejected']])),
    safe('routes.archived', () => countWhere(db, 'official_routes', [byAuth, ['status', 'archived']])),
    safe('routes.rejected', () => countWhere(db, 'official_routes', [byAuth, ['status', 'rejected']])),
    safe('routes.connectors', () => countWhere(db, 'official_routes', [byAuth, ['displayRole', 'connector']])),
    safe('parks.total', () => countWhere(db, 'parks', [byAuth])),
    safe('parks.published', () => countWhere(db, 'parks', [byAuth, ['published', true]])),
    safe('parks.unpublished', () => countWhere(db, 'parks', [byAuth, ['published', false]])),
    safe('parks.unpublished_draft', () => countWhere(db, 'parks', [byAuth, ['published', false], ['contentStatus', 'draft']])),
    safe('parks.unpublished_rejected', () => countWhere(db, 'parks', [byAuth, ['published', false], ['contentStatus', 'rejected']])),
    safe('users', () => countWhere(db, 'users', [['core.authorityId', authorityId]])),
  ]);

  const inv = invSnap && invSnap.exists ? readCityInventoryDoc(invSnap.id, invSnap.data()) : null;
  const rawStatus = typeof a.pipelineStatus === 'string' && a.pipelineStatus ? a.pipelineStatus : 'lead';
  const sub = (x: number | null, ...ys: Array<number | null>) => (x === null || ys.some((y) => y === null) ? null : Math.max(0, ys.reduce<number>((acc, y) => acc - (y as number), x)));

  return {
    authority: {
      id: authorityId,
      name: authorityNameOf(a.name) ?? authorityId,
      type: typeof a.type === 'string' ? a.type : null,
      tenantType: typeof a.tenantType === 'string' ? a.tenantType : null,
      pipelineStatus: rawStatus,
      pipelineLabel: PIPELINE_STATUS_LABELS[rawStatus as PipelineStatus] ?? null,
      isActiveClient: a.isActiveClient === true,
      population: typeof a.population === 'number' && Number.isFinite(a.population) && a.population > 0 ? a.population : null,
      parentAuthorityId: typeof a.parentAuthorityId === 'string' && a.parentAuthorityId ? a.parentAuthorityId : null,
    },
    inventory: inv
      ? {
          readinessLevel: inv.readiness.level,
          readinessScore: Math.round(inv.readiness.score),
          missingLayers: inv.readiness.missing,
          blockers: inv.readiness.blockers.slice(0, 3).map((b) => b.slice(0, 120)),
          areaKm2: inv.areaKm2 === null ? null : round1(inv.areaKm2),
          osmSnapshotDate: inv.snapshot.osmPbfDate || null,
          updatedAt: dayOf(inv.updatedAt),
          layers: compactLayers(inv),
        }
      : null,
    inventoryStatus: inv ? 'ok' : invSnap === null ? 'unreadable' : 'not_mapped',
    routes: {
      total: rTotal,
      published: rPub,
      pending: sub(rUnpub, rArchUnpub, rRejUnpub),
      archived: rArch,
      rejected: rRej,
      connectors: rConn,
      noPublishField: sub(rTotal, rPub, rUnpub),
    },
    parks: {
      total: pTotal,
      published: pPub,
      pending: sub(pUnpub, pDraft, pRej),
    },
    users: users === null ? null : maskSmall(users),
    failed,
  };
}

// ── the tool envelope ─────────────────────────────────────────────────────

export type AuthorityLookup =
  | { kind: 'resolved'; matchedBy: 'id' | 'name' | 'partial_name'; result: MetricResult<AuthorityOverview> }
  | { kind: 'ambiguous'; candidates: Array<{ id: string; name: string; type: string | null; tenantType: string | null }> }
  | { kind: 'none' }
  | { kind: 'unavailable' };

export const AUTHORITY_OVERVIEW_CAVEATS = [
  'routes/parks are counted by their authorityId field only — docs linked to the city by name alone are not counted',
  'isActiveClient and pipelineStatus are reported as stored (read only)',
];

/**
 * Resolve `query` to one authority, then compute its overview. Ambiguous / unknown → no
 * overview reads at all (only the cached authorities name list).
 */
export async function getAuthorityOverview(db: Firestore, query: string, opts: { now?: Date } = {}): Promise<AuthorityLookup> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  let rows: AuthorityRow[];
  try {
    rows = await cachedCompute('authority_rows', LIGHT_TOOL_TTL_MS, () => readAuthorityRows(db));
  } catch (err) {
    console.error('[admin-analytics/authority-overview] authorities list failed', err);
    return { kind: 'unavailable' };
  }
  const r = resolveAuthorityQuery(query, rows);
  if (r.kind === 'none') return r;
  if (r.kind === 'ambiguous') {
    return { kind: 'ambiguous', candidates: r.candidates.map((c) => ({ id: c.id, name: c.name, type: c.type, tenantType: c.tenantType })) };
  }
  const period = { from: null, to: today };
  try {
    const value = await computeAuthorityOverview(db, r.row.id);
    if (!value) return { kind: 'none' };
    return {
      kind: 'resolved',
      matchedBy: r.matchedBy,
      result: {
        value,
        meta: metaOf('authority_overview', period, {
          caveats: [...AUTHORITY_OVERVIEW_CAVEATS, ...value.failed.map((f) => `${f}: could not be counted (not zero)`)],
        }),
      },
    };
  } catch (err) {
    console.error('[admin-analytics/authority-overview] overview failed', err);
    return { kind: 'unavailable' };
  }
}
