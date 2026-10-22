/**
 * pending-approvals.server — what is waiting in the approval center, counted on the server
 * (plan §4: the page reads these from the browser, src/app/admin/approval-center/page.tsx
 * loadPending*). Same filters as the page, platform scope (super / root — no per-authority
 * narrowing):
 *   parks          published == false, contentStatus not draft/rejected      (loadPendingParks)
 *   routes         official_routes published == false, status not archived/rejected (loadPendingRoutes)
 *   climbs         climb_segments status == pending                          (loadPendingClimbs)
 *   contributions  user_contributions status == pending                      (getAllContributions('pending'))
 *   units          pending_units status == pending                           (loadPendingUnits)
 *   amenities      osm_amenities status == pending (page caps at 3000)       (fetchAmenitiesByStatus)
 * Top authorities = parks + routes by authorityId (the two queues that carry one).
 *
 * READ-ONLY. Listed in scripts/safety-check.sh's AUTHORIZED_ROUTE_WRITERS + MIGRATED list as a
 * reader (same pattern as scripts/lib/route-collections-read.node.ts), so any future write
 * here must go through buildValidatedDoc. Each queue fails on its own → null, never 0.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { authorityNames } from './authority-names.server';

export interface PendingApprovals {
  total: number;
  /** null = that queue could not be read (total then counts only the readable ones) */
  byType: {
    parks: number | null;
    routes: number | null;
    climbs: number | null;
    contributions: number | null;
    units: number | null;
    amenities: number | null;
  };
  failedTypes: string[];
  topAuthorities: Array<{ authorityId: string; name: string; count: number }>;
}

const AMENITY_PAGE_CAP = 3000;

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[admin-analytics/pending] ${label} failed:`, err);
    return null;
  }
}

export async function computePendingApprovals(db: Firestore): Promise<PendingApprovals> {
  // plain record, not a Map: keeps this file free of `.set(` (safety-check's write-verb scan)
  const byAuthority: Record<string, number> = {};
  const bump = (id: unknown) => {
    if (typeof id === 'string' && id) byAuthority[id] = (byAuthority[id] ?? 0) + 1;
  };

  const [parks, routes, climbs, contributions, units, amenities] = await Promise.all([
    safe('parks', async () => {
      const s = await db.collection('parks').where('published', '==', false).get();
      const docs = s.docs.filter((d) => {
        const cs = d.data()?.contentStatus;
        return cs !== 'draft' && cs !== 'rejected';
      });
      docs.forEach((d) => bump(d.data()?.authorityId));
      return docs.length;
    }),
    safe('routes', async () => {
      const s = await db.collection('official_routes').where('published', '==', false).select('status', 'authorityId').get();
      const docs = s.docs.filter((d) => {
        const st = d.data()?.status;
        return st !== 'archived' && st !== 'rejected';
      });
      docs.forEach((d) => bump(d.data()?.authorityId));
      return docs.length;
    }),
    safe('climbs', async () => (await db.collection('climb_segments').where('status', '==', 'pending').count().get()).data().count),
    safe('contributions', async () => (await db.collection('user_contributions').where('status', '==', 'pending').count().get()).data().count),
    safe('units', async () => (await db.collection('pending_units').where('status', '==', 'pending').count().get()).data().count),
    safe('amenities', async () => Math.min(AMENITY_PAGE_CAP, (await db.collection('osm_amenities').where('status', '==', 'pending').count().get()).data().count)),
  ]);

  const byType = { parks, routes, climbs, contributions, units, amenities };
  const failedTypes = Object.entries(byType).filter(([, v]) => v === null).map(([k]) => k);
  const total = Object.values(byType).reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const top = Object.entries(byAuthority).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  const names = await authorityNames(db, top.map(([id]) => id));
  return {
    total,
    byType,
    failedTypes,
    topAuthorities: top.map(([authorityId, count]) => ({ authorityId, name: names.get(authorityId) ?? authorityId, count })),
  };
}
