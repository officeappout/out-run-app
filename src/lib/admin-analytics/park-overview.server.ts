/**
 * park-overview.server — everything the admin assistant can say about ONE park, for the
 * get_park_overview tool. READ-ONLY (Admin SDK; no write verb).
 *
 * Real data it rests on (checked against production 22.10.2026):
 *   parks/{id}        name, authorityId, city, published / contentStatus, facilityType,
 *                     sportTypes, gymEquipment[], facilities[], amenity booleans,
 *                     primaryBrand, ratingAvg + reviewCount (denormalized from organic
 *                     user_contributions reviews), createdByUser + origin (3 docs only)
 *   sessions          one doc per saved workout detected at a park: {authorityId, parkId,
 *                     userId, date} — the only per-park visit data (≈413 docs, 15 parks)
 * There is no "mapped-by" credit field on a park: only `createdByUser` (a uid, reported as
 * present / absent — never the uid) and `origin`.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { cachedCompute, LIGHT_TOOL_TTL_MS } from './cache.server';
import { authorityNameMap, candidatesOut, dayOf, num, round, str, type ContentLookup } from './content-common.server';
import { parkStatusOf, resolveContentQuery, type ContentRow } from './content-resolve';
import { maskSmall, metaOf } from './meta';
import { toDateLike } from '@/lib/route-score/route-scores-doc';

const SESSIONS_READ_LIMIT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

const AMENITY_FLAGS = ['hasWaterFountain', 'isShaded', 'hasNaturalShade', 'hasBikeRacks', 'hasNearbyShelter', 'hasDogPark', 'hasLights'] as const;

export interface ParkOverview {
  park: {
    id: string;
    name: string;
    authorityId: string | null;
    authority: string | null;
    city: string | null;
    neighborhood: string | null;
    /** published / pending / draft / rejected / no_published_field */
    status: string;
    facilityType: string | null;
    sportTypes: string[];
    primaryBrand: string | null;
    createdAt: string | null;
    publishedAt: string | null;
    needsFacilityDetails: boolean;
    needsAuthorityTagging: boolean;
  };
  equipment: {
    gymEquipmentCount: number | null;
    facilitiesCount: number | null;
    facilityNames: string[];
    /** amenity flags that are explicitly true */
    amenities: string[];
  };
  ratings: {
    /** organic average (1-5) from user reviews; null = no rated reviews recorded */
    ratingAvg: number | null;
    reviewCount: number | null;
    /** the legacy admin-set star rating; not from users */
    adminRating: number | null;
  };
  credit: {
    /** a createdByUser uid is stored (not shown); false for imported / bulk parks */
    creatorRecorded: boolean;
    origin: string | null;
    importedFrom: string | null;
  };
  /** saved workouts detected at this park (sessions). null fields = could not be counted */
  visits: {
    total: number | null;
    last30Days: number | null;
    distinctUsers: number | '<5' | null;
    lastVisit: string | null;
  };
  failed: string[];
}

export async function readParkRows(db: Firestore): Promise<ContentRow[]> {
  const snap = await db.collection('parks').select('name', 'authorityId', 'city', 'published', 'contentStatus').get();
  return snap.docs.map((d) => {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    return { id: d.id, collection: 'parks' as const, name: str(x.name) ?? d.id, authorityId: str(x.authorityId), city: str(x.city), status: parkStatusOf(x) };
  });
}

export const PARK_OVERVIEW_CAVEATS = [
  'visits = sessions: saved workouts the app detected at this park (check-ins); a park nobody trained at shows 0 only when the count succeeded',
  'ratings are the denormalized average of organic user reviews; null means none recorded',
  'a park has no "mapped by" credit field — only whether a creator uid is stored and the record origin',
];

export async function computeParkOverview(db: Firestore, row: ContentRow, names: Map<string, string>, now: Date): Promise<ParkOverview | null> {
  const snap = await db.collection('parks').doc(row.id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, any>;
  const failed: string[] = [];

  let total: number | null = null;
  try {
    total = (await db.collection('sessions').where('parkId', '==', row.id).count().get()).data().count;
  } catch (err) {
    console.error('[admin-analytics/park-overview] sessions count failed', err);
    failed.push('visits.total');
  }
  let last30: number | null = null;
  let distinct: number | '<5' | null = null;
  let lastVisit: string | null = null;
  try {
    const s = await db.collection('sessions').where('parkId', '==', row.id).select('userId', 'date').limit(SESSIONS_READ_LIMIT).get();
    if (s.docs.length < SESSIONS_READ_LIMIT) {
      const since = now.getTime() - 30 * DAY_MS;
      const users = new Set<string>();
      let recent = 0;
      let latest = 0;
      for (const doc of s.docs) {
        const x = (doc.data() ?? {}) as Record<string, unknown>;
        const t = toDateLike(x.date)?.getTime() ?? 0;
        if (t >= since) recent += 1;
        if (t > latest) latest = t;
        if (typeof x.userId === 'string') users.add(x.userId);
      }
      last30 = recent;
      distinct = maskSmall(users.size);
      lastVisit = latest > 0 ? new Date(latest).toISOString().slice(0, 10) : null;
    } else {
      failed.push('visits.details (too many sessions to read)');
    }
  } catch (err) {
    console.error('[admin-analytics/park-overview] sessions read failed', err);
    failed.push('visits.details');
  }

  const authorityId = str(d.authorityId);
  const facilities: any[] | null = Array.isArray(d.facilities) ? d.facilities : null;
  const ratingAvg = num(d.ratingAvg);
  return {
    park: {
      id: row.id,
      name: str(d.name) ?? row.id,
      authorityId,
      authority: authorityId ? names.get(authorityId) ?? null : null,
      city: str(d.city),
      neighborhood: str(d.neighborhoodName),
      status: parkStatusOf(d),
      facilityType: str(d.facilityType),
      sportTypes: Array.isArray(d.sportTypes) ? d.sportTypes.filter((x: unknown) => typeof x === 'string').slice(0, 6) : [],
      primaryBrand: str(d.primaryBrand),
      createdAt: dayOf(d.createdAt),
      publishedAt: dayOf(d.publishedAt),
      needsFacilityDetails: d.needsFacilityDetails === true,
      needsAuthorityTagging: d.needsAuthorityTagging === true,
    },
    equipment: {
      gymEquipmentCount: Array.isArray(d.gymEquipment) ? d.gymEquipment.length : null,
      facilitiesCount: facilities ? facilities.length : null,
      facilityNames: facilities ? facilities.map((f) => str(f?.name)).filter((x): x is string => !!x).slice(0, 8) : [],
      amenities: AMENITY_FLAGS.filter((k) => d[k] === true),
    },
    ratings: {
      ratingAvg: ratingAvg === null ? null : round(ratingAvg, 1),
      reviewCount: num(d.reviewCount),
      adminRating: num(d.rating),
    },
    credit: { creatorRecorded: str(d.createdByUser) !== null, origin: str(d.origin), importedFrom: str(d.importedFrom) },
    visits: { total, last30Days: last30, distinctUsers: distinct, lastVisit },
    failed,
  };
}

export async function getParkOverview(db: Firestore, query: string, opts: { now?: Date } = {}): Promise<ContentLookup<ParkOverview>> {
  const now = opts.now ?? new Date();
  const today = getIsraelDateKey(now);
  let rows: ContentRow[];
  try {
    rows = await cachedCompute('content_rows:parks', LIGHT_TOOL_TTL_MS, () => readParkRows(db));
  } catch (err) {
    console.error('[admin-analytics/park-overview] park list failed', err);
    return { kind: 'unavailable' };
  }
  const r = resolveContentQuery(query, rows);
  if (r.kind === 'none') return r;
  const names = await authorityNameMap(db);
  if (r.kind === 'ambiguous') return { kind: 'ambiguous', candidates: candidatesOut(r.candidates, names) };
  try {
    const value = await computeParkOverview(db, r.row, names, now);
    if (!value) return { kind: 'none' };
    return {
      kind: 'resolved',
      matchedBy: r.matchedBy,
      result: {
        value,
        meta: metaOf('park_overview', { from: null, to: today }, {
          caveats: [...PARK_OVERVIEW_CAVEATS, ...value.failed.map((f) => `${f}: could not be counted (not zero)`)],
        }),
      },
    };
  } catch (err) {
    console.error('[admin-analytics/park-overview] overview failed', err);
    return { kind: 'unavailable' };
  }
}
