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
 *     Requires a collection-group index on `units.managerIds`
 *     (firestore.indexes.json, fieldOverrides, added 24.09.2026 — deploy
 *     via `firebase deploy --only firestore:indexes` BEFORE this code is
 *     ever pointed at production; the emulator does not enforce
 *     collection-group index requirements, so Stage 1's emulator tests
 *     pass with or without it).
 *   - anyone else: denied.
 *
 * Fail-closed, deliberately the OPPOSITE of src/lib/rateLimit.ts's
 * fail-open (David, 24.09.2026): "אם שאילתת ה-collectionGroup נכשלת מכל
 * סיבה (אינדקס חסר, Firestore לא זמין, timeout) — התוצאה היא denied, לא
 * ברירת מחדל מתירנית ולא חריגה שנבלעת במעלה הדרך והופכת להרשאה." Every
 * Firestore read in this function is wrapped in ONE try/catch that returns
 * `denied` on ANY failure — a missing index, a transient outage, a
 * timeout, or a bug — rather than letting the exception propagate to a
 * caller that might (now or later) treat a thrown error as anything other
 * than "no access." rateLimit.ts fails open because letting one extra
 * request through during an outage is cheap; this function fails closed
 * because the cost of the equivalent mistake here is a stranger approving
 * or reading someone else's unit membership.
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
  try {
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
  } catch (err) {
    console.error(`[unitPermissionScope] resolution failed for uid=${uid} — failing CLOSED (denied)`, err);
    return { kind: 'denied' };
  }
}
