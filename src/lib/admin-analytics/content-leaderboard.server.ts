/**
 * content-leaderboard.server — top-N routes / parks for the get_content_leaderboard tool.
 * READ-ONLY. Only what the database really has:
 *
 *   routes · usage   official_routes.analytics.usageCount (saved workouts from a guided route)
 *   routes · rating  NOT AVAILABLE — routes have no user ratings (the `rating` field on a route
 *                    doc is an admin/default value; per-route quality is in get_route_overview)
 *   routes · recent  official_routes.createdAt (recently ADDED)
 *   parks  · usage   sessions (saved workouts detected at the park), grouped by parkId
 *   parks  · rating  parks.ratingAvg + reviewCount (organic reviews; most parks have ≤1)
 *   parks  · recent  parks.createdAt (recently ADDED)
 *
 * Queries use single-field order/equality only (no composite index): authority and
 * published filters are applied in memory over a bounded read. A truncated read is said so.
 *
 * Listed in scripts/safety-check.sh as a READER (no write verb): it names route collections.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { toDateLike } from '@/lib/route-score/route-scores-doc';
import { authorityNameMap, dayOf, num, round, str } from './content-common.server';
import { parkStatusOf, routeStatusOf } from './content-resolve';
import { metaOf, type MetricResult } from './meta';

export type LeaderboardKind = 'routes' | 'parks';
export type LeaderboardBy = 'usage' | 'rating' | 'recent';

export const LEADERBOARD_DEFAULT_LIMIT = 5;
export const LEADERBOARD_MAX_LIMIT = 10;
const READ_CAP = 500;
const SESSIONS_CAP = 20000;

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  city: string | null;
  authority: string | null;
  status: string;
  /** usage: completions / visits; rating: average (1-5); recent: ISO day added */
  value: number | string | null;
  /** rating only: how many reviews back the average */
  reviewCount?: number | null;
  lastUsed?: string | null;
}

export interface Leaderboard {
  kind: LeaderboardKind;
  by: LeaderboardBy;
  authorityId: string | null;
  /** false = the data this ranking needs does not exist; `reason` says why */
  supported: boolean;
  reason: string | null;
  entries: LeaderboardEntry[];
  /** how many records the ranking was computed over (before the top-N cut) */
  ranked: number | null;
}

const BASE_CAVEATS: Record<string, string[]> = {
  'routes:usage': [
    'usage = analytics.usageCount: workouts SAVED from a guided official route (a completion, not a start); only 27 routes carry it today, all in one authority, partly demo-seeded — a route not listed is "not measured", not zero',
  ],
  'parks:usage': ['usage = sessions: saved workouts the app detected at the park (check-ins); parks with none are not listed'],
  'parks:rating': ['rating = denormalized average of organic user reviews; most parks have 0-1 reviews — small samples, do not draw conclusions from a single review'],
  'routes:recent': ['recent = recently ADDED to official_routes (createdAt), any status — not recently used'],
  'parks:recent': ['recent = recently ADDED (createdAt), any status — not recently visited'],
};

function unsupported(kind: LeaderboardKind, by: LeaderboardBy, authorityId: string | null, reason: string): Leaderboard {
  return { kind, by, authorityId, supported: false, reason, entries: [], ranked: null };
}

const tsOf = (v: unknown) => toDateLike(v)?.getTime() ?? 0;

interface Candidate {
  id: string;
  name: string;
  city: string | null;
  authorityId: string | null;
  status: string;
  sort: number;
  value: number | string | null;
  reviewCount?: number | null;
  lastUsed?: string | null;
}

export async function computeLeaderboard(
  db: Firestore,
  input: { kind: LeaderboardKind; by: LeaderboardBy; authorityId: string | null; limit: number | null },
): Promise<{ board: Leaderboard; truncated: boolean } | null> {
  const { kind, by, authorityId } = input;
  const limit = Math.min(Math.max(input.limit ?? LEADERBOARD_DEFAULT_LIMIT, 1), LEADERBOARD_MAX_LIMIT);
  if (kind === 'routes' && by === 'rating') {
    return { board: unsupported(kind, by, authorityId, 'routes have no user ratings in the database (the route "rating" field is an admin/default value). Per-route quality score exists — see get_route_overview'), truncated: false };
  }
  let cands: Candidate[] = [];
  let truncated = false;

  if (kind === 'routes') {
    if (by === 'usage') {
      const snap = await db.collection('official_routes').where('analytics.usageCount', '>', 0).orderBy('analytics.usageCount', 'desc').limit(READ_CAP).get();
      truncated = snap.docs.length >= READ_CAP;
      cands = snap.docs.map((d) => {
        const x = d.data() as Record<string, any>;
        return { id: d.id, name: str(x.name) ?? d.id, city: str(x.city), authorityId: str(x.authorityId), status: routeStatusOf(x), sort: num(x.analytics?.usageCount) ?? 0, value: num(x.analytics?.usageCount), lastUsed: dayOf(x.analytics?.lastUsed) };
      });
    } else {
      const base = db.collection('official_routes').select('name', 'city', 'authorityId', 'status', 'published', 'createdAt');
      const snap = await (authorityId ? base.where('authorityId', '==', authorityId) : base.orderBy('createdAt', 'desc')).limit(READ_CAP).get();
      truncated = snap.docs.length >= READ_CAP;
      cands = snap.docs
        .map((d) => {
          const x = d.data() as Record<string, any>;
          return { id: d.id, name: str(x.name) ?? d.id, city: str(x.city), authorityId: str(x.authorityId), status: routeStatusOf(x), sort: tsOf(x.createdAt), value: dayOf(x.createdAt) };
        })
        .filter((c) => c.sort > 0);
    }
  } else if (by === 'usage') {
    // NOT filtered by the session's authorityId: that is the USER's authority. The park's own
    // authority filters the grouped result below.
    const snap = await db.collection('sessions').select('parkId').limit(SESSIONS_CAP).get();
    truncated = snap.docs.length >= SESSIONS_CAP;
    const perPark = new Map<string, number>();
    for (const d of snap.docs) {
      const pid = str((d.data() as Record<string, unknown>).parkId);
      if (pid) perPark.set(pid, (perPark.get(pid) ?? 0) + 1);
    }
    const top = Array.from(perPark.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, authorityId ? 300 : limit);
    const docs = await Promise.all(top.map(([id]) => db.collection('parks').doc(id).get()));
    cands = top.map(([id, n], i) => {
      const x = (docs[i].exists ? docs[i].data() : {}) as Record<string, any>;
      return { id, name: str(x.name) ?? id, city: str(x.city), authorityId: str(x.authorityId), status: docs[i].exists ? parkStatusOf(x) : 'park_doc_missing', sort: n, value: n };
    });
    return finish(db, { kind, by, authorityId }, cands, limit, truncated, authorityId ? null : perPark.size);
  } else if (by === 'rating') {
    const snap = await db.collection('parks').where('reviewCount', '>', 0).limit(READ_CAP).get();
    truncated = snap.docs.length >= READ_CAP;
    cands = snap.docs
      .map((d) => {
        const x = d.data() as Record<string, any>;
        return { id: d.id, name: str(x.name) ?? d.id, city: str(x.city), authorityId: str(x.authorityId), status: parkStatusOf(x), sort: (num(x.ratingAvg) ?? -1) + (num(x.reviewCount) ?? 0) / 1e6, value: num(x.ratingAvg) === null ? null : round(x.ratingAvg, 1), reviewCount: num(x.reviewCount) };
      })
      .filter((c) => c.value !== null);
  } else {
    const base = db.collection('parks').select('name', 'city', 'authorityId', 'published', 'contentStatus', 'createdAt');
    const snap = await (authorityId ? base.where('authorityId', '==', authorityId) : base.orderBy('createdAt', 'desc')).limit(READ_CAP).get();
    truncated = snap.docs.length >= READ_CAP;
    cands = snap.docs
      .map((d) => {
        const x = d.data() as Record<string, any>;
        return { id: d.id, name: str(x.name) ?? d.id, city: str(x.city), authorityId: str(x.authorityId), status: parkStatusOf(x), sort: tsOf(x.createdAt), value: dayOf(x.createdAt) };
      })
      .filter((c) => c.sort > 0);
  }
  return finish(db, { kind, by, authorityId }, cands, limit, truncated, null);
}

async function finish(
  db: Firestore,
  head: { kind: LeaderboardKind; by: LeaderboardBy; authorityId: string | null },
  all: Candidate[],
  limit: number,
  truncated: boolean,
  rankedOverride: number | null,
): Promise<{ board: Leaderboard; truncated: boolean }> {
  // park usage was already grouped + filtered by authority in the query; everything else filters here
  const filtered = head.authorityId ? all.filter((c) => c.authorityId === head.authorityId) : all;
  const sorted = filtered.slice().sort((a, b) => b.sort - a.sort || a.id.localeCompare(b.id));
  const names = await authorityNameMap(db);
  return {
    truncated,
    board: {
      ...head,
      supported: true,
      reason: null,
      ranked: rankedOverride ?? filtered.length,
      entries: sorted.slice(0, limit).map((c, i) => ({
        rank: i + 1,
        id: c.id,
        name: c.name,
        city: c.city,
        authority: c.authorityId ? names.get(c.authorityId) ?? null : null,
        status: c.status,
        value: c.value,
        ...(c.reviewCount !== undefined ? { reviewCount: c.reviewCount } : {}),
        ...(c.lastUsed !== undefined ? { lastUsed: c.lastUsed } : {}),
      })),
    },
  };
}

/** Tool envelope: value null = could not be computed (never an empty board posing as data). */
export async function getContentLeaderboard(
  db: Firestore,
  input: { kind: LeaderboardKind; by: LeaderboardBy; authorityId: string | null; limit: number | null },
  opts: { now?: Date } = {},
): Promise<MetricResult<Leaderboard>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  const period = { from: null, to: today };
  try {
    const r = await computeLeaderboard(db, input);
    if (!r) return { value: null, meta: metaOf('content_leaderboard', period), error: 'unavailable' };
    const caveats = [...(BASE_CAVEATS[`${input.kind}:${input.by}`] ?? [])];
    if (r.truncated) caveats.push('the read was capped — the ranking covers only part of the data');
    if (input.authorityId && r.board.supported) caveats.push('filtered by the given authorityId (an id, not a name — use get_authority_overview to resolve a name)');
    return { value: r.board, meta: metaOf('content_leaderboard', period, { n: r.board.ranked, caveats }) };
  } catch (err) {
    console.error('[admin-analytics/content-leaderboard] failed', err);
    return { value: null, meta: metaOf('content_leaderboard', period), error: 'unavailable' };
  }
}
