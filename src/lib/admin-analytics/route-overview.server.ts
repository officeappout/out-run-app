/**
 * route-overview.server — everything the admin assistant can say about ONE route
 * (official_routes or curated_routes), for the get_route_overview tool, plus the route
 * reads the content leaderboard needs. READ-ONLY (Admin SDK; no write verb in this file).
 *
 * Real data it rests on (checked against production 22.10.2026):
 *   official_routes/{id}   name, authorityId, city, published/status, distance (km), type,
 *                          difficulty, routeShape, surfaceType, displayRole, createdAt,
 *                          analytics.usageCount + analytics.lastUsed
 *   curated_routes/{id}    same shape; NO published/status workflow (system "hero" loops)
 *   route_scores/{id}      score 0-100, band, confidence, surfaceClass, sourceTier, selection
 *
 * Usage data: ONLY `analytics.usageCount` / `lastUsed` on official_routes. It is bumped by
 * the running player when a workout is SAVED from a guided official route (a completion,
 * not a start). Today 27 routes carry it, all in one authority (Sderot, partly demo-seeded).
 * Per-route "started" and "viewed" are not recorded anywhere. A missing counter is reported
 * as null (not measured) — never 0.
 *
 * Listed in scripts/safety-check.sh as a READER (no write verb): it names route collections.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { readRouteScoreDoc, type RouteScoreDoc } from '@/lib/route-score/route-scores-doc';
import { getIsraelDateKey } from '@/lib/israelTime';
import { cachedCompute, LIGHT_TOOL_TTL_MS } from './cache.server';
import { authorityNameMap, candidatesOut, dayOf, num, round, str, type ContentLookup } from './content-common.server';
import { resolveContentQuery, routeStatusOf, type ContentRow } from './content-resolve';
import { metaOf } from './meta';

export interface RouteOverview {
  route: {
    id: string;
    collection: 'official_routes' | 'curated_routes';
    name: string;
    authorityId: string | null;
    authority: string | null;
    city: string | null;
    /** official: published / pending / archived / rejected / no_publish_field; curated: no_publish_workflow */
    status: string;
    activityType: string | null;
    distanceKm: number | null;
    durationMin: number | null;
    difficulty: string | null;
    routeShape: string | null;
    surfaceType: string | null;
    isConnector: boolean;
    createdAt: string | null;
    publishedAt: string | null;
  };
  /** null = no route_scores doc (not scored yet) or unreadable — see scoreStatus */
  score: {
    score: number;
    band: string;
    confidence: number;
    surfaceClass: string;
    sourceTier: string;
    selection: string | null;
    selectionReason: string | null;
    computedAt: string | null;
  } | null;
  scoreStatus: 'ok' | 'not_scored' | 'unreadable';
  usage: {
    /** analytics.usageCount: saved workouts from this guided route. null = the counter is absent (not measured / never used — indistinguishable) */
    completions: number | null;
    lastUsed: string | null;
  };
}

// ── the name index ──────────────────────────────────────────────────────────

export async function readRouteRows(db: Firestore): Promise<ContentRow[]> {
  const rows: ContentRow[] = [];
  const official = await db.collection('official_routes').select('name', 'authorityId', 'city', 'status', 'published').get();
  for (const d of official.docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    rows.push({ id: d.id, collection: 'official_routes', name: str(x.name) ?? d.id, authorityId: str(x.authorityId), city: str(x.city), status: routeStatusOf(x) });
  }
  const curated = await db.collection('curated_routes').select('name', 'authorityId', 'city').get();
  for (const d of curated.docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    rows.push({ id: d.id, collection: 'curated_routes', name: str(x.name) ?? d.id, authorityId: str(x.authorityId), city: str(x.city), status: 'no_publish_workflow' });
  }
  return rows;
}

export const ROUTE_OVERVIEW_CAVEATS = [
  'usage = analytics.usageCount: workouts SAVED from this guided official route (a completion, not a start); only some routes carry it. Per-route starts and views are not recorded anywhere',
  'a null completions value means the counter is absent (not measured), not zero',
  'status is read from the stored published/status fields; curated_routes have no publish workflow',
];

function scoreOut(s: RouteScoreDoc) {
  return {
    score: Math.round(s.score),
    band: s.band,
    confidence: round(s.confidence, 2),
    surfaceClass: s.surfaceClass,
    sourceTier: s.sourceTier,
    selection: s.selection ?? null,
    selectionReason: s.selectionReason ? s.selectionReason.slice(0, 160) : null,
    computedAt: s.computedAt.getTime() > 0 ? s.computedAt.toISOString().slice(0, 10) : null,
  };
}

export async function computeRouteOverview(db: Firestore, row: ContentRow, names: Map<string, string>): Promise<{ value: RouteOverview; failed: string[] } | null> {
  const snap = await db.collection(row.collection).doc(row.id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, any>;
  const failed: string[] = [];
  let score: RouteScoreDoc | null = null;
  let scoreStatus: RouteOverview['scoreStatus'] = 'not_scored';
  try {
    score = await readRouteScoreDoc(db as never, row.id);
    scoreStatus = score ? 'ok' : 'not_scored';
  } catch (err) {
    console.error('[admin-analytics/route-overview] route_scores read failed', err);
    scoreStatus = 'unreadable';
    failed.push('score');
  }
  const authorityId = str(d.authorityId);
  const usageCount = row.collection === 'official_routes' ? num(d.analytics?.usageCount) : null;
  return {
    failed,
    value: {
      route: {
        id: row.id,
        collection: row.collection as 'official_routes' | 'curated_routes',
        name: str(d.name) ?? row.id,
        authorityId,
        authority: authorityId ? names.get(authorityId) ?? null : null,
        city: str(d.city),
        status: row.collection === 'curated_routes' ? 'no_publish_workflow' : routeStatusOf(d),
        activityType: str(d.activityType) ?? str(d.type),
        distanceKm: num(d.distance) === null ? null : round(d.distance, 2),
        durationMin: num(d.duration) === null ? null : Math.round(d.duration),
        difficulty: str(d.difficulty),
        routeShape: str(d.routeShape),
        surfaceType: str(d.surfaceType),
        isConnector: d.displayRole === 'connector',
        createdAt: dayOf(d.createdAt),
        publishedAt: dayOf(d.publishedAt),
      },
      score: score ? scoreOut(score) : null,
      scoreStatus,
      usage: { completions: usageCount, lastUsed: row.collection === 'official_routes' ? dayOf(d.analytics?.lastUsed) : null },
    },
  };
}

export async function getRouteOverview(db: Firestore, query: string, opts: { now?: Date } = {}): Promise<ContentLookup<RouteOverview>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  let rows: ContentRow[];
  try {
    rows = await cachedCompute('content_rows:routes', LIGHT_TOOL_TTL_MS, () => readRouteRows(db));
  } catch (err) {
    console.error('[admin-analytics/route-overview] route list failed', err);
    return { kind: 'unavailable' };
  }
  const r = resolveContentQuery(query, rows);
  if (r.kind === 'none') return r;
  const names = await authorityNameMap(db);
  if (r.kind === 'ambiguous') return { kind: 'ambiguous', candidates: candidatesOut(r.candidates, names) };
  try {
    const ov = await computeRouteOverview(db, r.row, names);
    if (!ov) return { kind: 'none' };
    return {
      kind: 'resolved',
      matchedBy: r.matchedBy,
      result: {
        value: ov.value,
        meta: metaOf('route_overview', { from: null, to: today }, {
          caveats: [...ROUTE_OVERVIEW_CAVEATS, ...ov.failed.map((f) => `${f}: could not be read (not zero)`)],
        }),
      },
    };
  } catch (err) {
    console.error('[admin-analytics/route-overview] overview failed', err);
    return { kind: 'unavailable' };
  }
}
