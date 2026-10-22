/**
 * official_routes docs with NO `published` field — live for every user (the app hides only
 * `published === false`) but invisible to the approval center, whose browser query is
 * `where('published', '==', false)` and can never match an absent field (axiom §33). Example
 * found 22.10.2026: 26 Sderot routes imported without a status. Reader table + the meaning of
 * "missing": src/lib/routes-nationwide/publish-status.ts.
 *
 * Firestore cannot query "field is absent", so this is a server-side (Admin SDK) scan with a
 * narrow projection, filtered in memory:
 *   - scope 'all'        (super admin): the whole collection, select() of 9 small fields;
 *   - scope 'authority'  (authority manager): `where('authorityId','==',id)` first, then the
 *                        same filter — a manager never receives another authority's rows.
 * A route with no authorityId at all is only ever visible to the 'all' scope.
 *
 * READ-ONLY. Listed in scripts/safety-check.sh's AUTHORIZED_ROUTE_WRITERS + MIGRATED lists as
 * a reader (same pattern as src/lib/admin-analytics/pending-approvals.server.ts), so any future
 * write here must go through buildValidatedDoc.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { hasNoPublishedField } from '@/lib/routes-nationwide/publish-status';

export type NoStatusScope = { kind: 'all' } | { kind: 'authority'; authorityId: string };

export interface NoStatusRouteRow {
  id: string;
  name: string;
  city: string | null;
  authorityId: string | null;
  distance: number | null;
  activityType: string | null;
  origin: string | null;
  createdByUser: string | null;
  /** the doc's own status, if any (absent for the Sderot case) */
  status: string | null;
}

export interface NoStatusRoutesResult {
  rows: NoStatusRouteRow[];
  scanned: number;
  truncated: boolean;
}

export const NO_STATUS_MAX_RESULTS = 500;

const PROJECTION = ['published', 'status', 'name', 'city', 'authorityId', 'distance', 'activityType', 'origin', 'createdByUser'] as const;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export async function computeNoStatusRoutes(db: Firestore, scope: NoStatusScope): Promise<NoStatusRoutesResult> {
  const base = db.collection('official_routes');
  const q = scope.kind === 'authority' ? base.where('authorityId', '==', scope.authorityId) : base;
  const snap = await q.select(...PROJECTION).get();
  const rows: NoStatusRouteRow[] = [];
  let truncated = false;
  for (const d of snap.docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    if (!hasNoPublishedField(x)) continue;
    // Deliberately NOT skipping status archived/rejected here (unlike the pending queue): with
    // no `published` field such a doc is still LIVE for users, so it needs an admin decision —
    // reject sets published:false and really hides it. `status` is returned so the UI shows it.
    if (rows.length >= NO_STATUS_MAX_RESULTS) { truncated = true; break; }
    rows.push({
      id: d.id,
      name: str(x.name) ?? '',
      city: str(x.city),
      authorityId: str(x.authorityId),
      distance: typeof x.distance === 'number' && Number.isFinite(x.distance) ? x.distance : null,
      activityType: str(x.activityType),
      origin: str(x.origin),
      createdByUser: str(x.createdByUser),
      status: str(x.status),
    });
  }
  return { rows, scanned: snap.docs.length, truncated };
}
