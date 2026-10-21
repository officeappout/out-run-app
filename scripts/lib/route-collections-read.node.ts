/**
 * scripts/lib/route-collections-read.node.ts — READ-ONLY pagers over the
 * route collections, for dry-run scripts (backfill-route-score, the
 * nationwide runner). No write verb lives in this file, ever: it is on
 * safety-check.sh's AUTHORIZED_ROUTE_WRITERS only because the tripwire keys on
 * the collection literal, and on MIGRATED_CHOKEPOINT_WRITERS so that any write
 * added here later is forced through buildValidatedDoc.
 */
import type { Firestore } from 'firebase-admin/firestore';

export interface RawDoc { id: string; data: Record<string, any> }

/** Every official_routes doc (optionally one authority), full fields, paged by document id. */
export async function readAllOfficialRoutes(db: Firestore, opts: { authorityId?: string | null; pageSize?: number } = {}): Promise<RawDoc[]> {
  const { FieldPath } = await import('firebase-admin/firestore');
  const pageSize = opts.pageSize ?? 300;
  const out: RawDoc[] = [];
  let after: string | null = null;
  for (;;) {
    let q = db.collection('official_routes').orderBy(FieldPath.documentId()).limit(pageSize);
    if (opts.authorityId) q = q.where('authorityId', '==', opts.authorityId);
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    for (const d of snap.docs) out.push({ id: d.id, data: d.data() });
    if (snap.size < pageSize) break;
    after = snap.docs[snap.docs.length - 1].id;
  }
  return out;
}

/** street_segments of one authority — only the fields the surface join needs. */
export async function readStreetSegmentSurfaces(db: Firestore, authorityId: string, pageSize = 1000): Promise<Array<{ id: string; path: unknown; coordinates: unknown; surfaceType: unknown }>> {
  const { FieldPath } = await import('firebase-admin/firestore');
  const out: Array<{ id: string; path: unknown; coordinates: unknown; surfaceType: unknown }> = [];
  let after: string | null = null;
  for (;;) {
    let q = db.collection('street_segments').where('authorityId', '==', authorityId)
      .select('path', 'coordinates', 'surfaceType').orderBy(FieldPath.documentId()).limit(pageSize);
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    for (const d of snap.docs) { const x = d.data(); out.push({ id: d.id, path: x.path, coordinates: x.coordinates, surfaceType: x.surfaceType }); }
    if (snap.size < pageSize) break;
    after = snap.docs[snap.docs.length - 1].id;
  }
  return out;
}
