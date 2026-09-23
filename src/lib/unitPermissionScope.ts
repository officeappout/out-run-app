/**
 * unitPermissionScope.ts — server-side-only role → scope resolution for the
 * military/school unit join-request loop (Stage 0 of the tenant/military/
 * school vertical build — see .claude/plans/tenant-military-school-vertical-
 * model.md §ח, and docs/SPEC-PERMISSIONS-MODEL.md for the wider root→level1→
 * level2 hierarchy this instantiates for the military/school verticals).
 *
 * Hard requirement (David, 23.09.2026): "פונקציה טהורה, הסקופ נקבע מה-uid
 * בלבד. שום קלט מהלקוח לא נכנס אליה." — resolveUnitPermissionScope takes
 * ONLY a uid. Every fact it returns is read from Firestore via the Admin
 * SDK, keyed off that uid — never from a client-supplied tenantId/unitId/
 * role. This is the same shape as src/lib/adminAnalyticsScope.ts's
 * resolveAdminAnalyticsScope (Task 3's precedent) — extended here with a
 * new 'unitAdmin' level for the level-2 (unit) admin role, since no
 * equivalent existed in that resolver.
 *
 * Level → scope decisions:
 *   - root: isRootAdmin(core.email) — matches the SAME gate already used by
 *     POST /api/admin/invitations, not core.isSuperAdmin. Chosen because
 *     SPEC-PERMISSIONS-MODEL.md §10 itself flags "root vs super_admin, are
 *     they the same" as unverified — using the one gate that's actually
 *     wired into a live root-only route today avoids depending on an
 *     unverified equivalence. email is read from the caller's OWN
 *     `users/{uid}.core.email` doc (fetched internally, by the same uid
 *     the function was given) — this is a Firestore read keyed by uid, not
 *     client input, so it does not violate the "uid only" requirement.
 *   - tenantOwner (SPEC's level-1 for military/school — "the tenant"is the
 *     top-level authorities/{id} doc, type military_unit or school):
 *     reverse query `authorities.where('managerIds','array-contains',uid)`,
 *     same pattern as adminAnalyticsScope's 'authority' scope. Filtered to
 *     military_unit/school so a municipal authority_manager (a different,
 *     already-shipped level-1 role) never resolves into this vertical's
 *     scope by accident.
 *   - unitAdmin (SPEC's level-2 for military/school — a sub-unit inside a
 *     tenant, `tenants/{tenantId}/units/{unitId}`): NEW field introduced by
 *     this stage — `managerIds` on a unit doc, mirroring the authority-level
 *     convention. `tenants/{tenantId}/units` is a subcollection, so this
 *     requires a `collectionGroup('units')` query. tenantId is derived from
 *     the matched doc's own path (`ref.parent.parent.id`), never guessed;
 *     unitIds is every unit under that SAME tenantId the uid manages (a uid
 *     managing units across more than one tenant is not an expected shape,
 *     but if it ever happens, only the first tenant's units are returned —
 *     scope is always single-tenant, by construction).
 *     ⚠️ Infra note (not a firestore.rules change — David's Stage-0/1
 *     instruction was explicitly rules-out-of-scope this round, but this is
 *     the equivalent flag for indexes): a `collectionGroup('units')` query
 *     filtered on `managerIds` needs a collection-group index on
 *     `units.managerIds` in firestore.indexes.json before this works in
 *     PRODUCTION. The Firestore emulator does not enforce collection-group
 *     index requirements, so Stage 1's emulator tests pass without it. This
 *     index must be added before Stage 1 is ever pointed at production.
 *   - anyone else: denied.
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';

const TENANT_AUTHORITY_TYPES = ['military_unit', 'school'];

export type UnitPermissionScope =
  | { kind: 'root' }
  | { kind: 'tenantOwner'; tenantId: string }
  | { kind: 'unitAdmin'; tenantId: string; unitIds: string[] }
  | { kind: 'denied' };

export async function resolveUnitPermissionScope(uid: string): Promise<UnitPermissionScope> {
  const db = getAdminDb();

  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
  const email = typeof core.email === 'string' ? core.email : null;

  if (isRootAdmin(email)) {
    return { kind: 'root' };
  }

  const ownedTenantSnap = await db
    .collection('authorities')
    .where('managerIds', 'array-contains', uid)
    .where('type', 'in', TENANT_AUTHORITY_TYPES)
    .limit(1)
    .get();
  if (!ownedTenantSnap.empty) {
    return { kind: 'tenantOwner', tenantId: ownedTenantSnap.docs[0].id };
  }

  const managedUnitsSnap = await db.collectionGroup('units').where('managerIds', 'array-contains', uid).get();
  if (!managedUnitsSnap.empty) {
    const tenantId = managedUnitsSnap.docs[0].ref.parent.parent?.id;
    if (tenantId) {
      const unitIds = managedUnitsSnap.docs
        .filter((d) => d.ref.parent.parent?.id === tenantId)
        .map((d) => d.id);
      return { kind: 'unitAdmin', tenantId, unitIds };
    }
  }

  return { kind: 'denied' };
}
