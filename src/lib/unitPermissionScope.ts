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
 *     the directly-managed set (a uid managing units across more than one
 *     tenant is not an expected shape, but if it ever happens, only the
 *     first tenant's units are returned — scope is always single-tenant, by
 *     construction) is then expanded DOWNWARD via `expandUnitIdsDownward`
 *     (25.09.2026, §13.28 — David's explicit decision: "מפקד של יחידה רואה
 *     את כל מה שתחתיה," one place, not a per-endpoint special case) — the
 *     returned `unitIds` is every unit the uid directly manages PLUS every
 *     descendant of those units, never an ancestor or a sibling. See that
 *     function's own doc comment for the walk itself.
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
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';

const TENANT_AUTHORITY_TYPES = ['military_unit', 'school'];

// Real hierarchies are 2-3 levels deep (§13.17) — this is a defensive cap
// against a cyclic/malformed parentUnitId chain, not a real-world limit.
const MAX_DOWNWARD_DEPTH = 10;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Downward closure of a directly-managed unit set — every descendant unit,
 * walked via parentUnitId (25.09.2026, §13.28 — David's explicit decision:
 * "מפקד של יחידה רואה את כל מה שתחתיה... מקום אחד, לא שניים." Previously
 * implemented as a local per-endpoint helper in /api/units/structure only,
 * which created a real, reported inconsistency — a unit_admin could see a
 * descendant unit exists via /structure but still get 403 on /members for
 * the SAME unit. Moved here so every consumer of this scope inherits the
 * same authorization surface automatically, with no per-endpoint special
 * casing. parentUnitId is the SAME single-level pointer unitPath's own
 * construction (unit-doc.ts) and every other hierarchy traversal in this
 * codebase already walk — not a new mechanism, not a new field.
 *
 * BFS level-by-level (one chunked query per LEVEL, not per unit) so a
 * fan-out battalion with many companies costs O(depth) queries, not
 * O(units). Strictly downward — a unit's own parentUnitId is never
 * consulted here, so this can only ADD descendants, never a sibling or an
 * ancestor. Any query failure (chunk().map(...).get()) throws out of this
 * function; the caller (resolveUnitPermissionScope's own try/catch, below)
 * catches it and returns 'denied' — a partial expansion is never returned
 * as if it were complete. Same fail-closed contract as before this change,
 * unchanged.
 */
async function expandUnitIdsDownward(db: Firestore, tenantId: string, directUnitIds: string[]): Promise<string[]> {
  const unitsCollection = db.collection('tenants').doc(tenantId).collection('units');
  const allIds = new Set(directUnitIds);
  let frontier = directUnitIds;
  for (let depth = 0; depth < MAX_DOWNWARD_DEPTH && frontier.length > 0; depth++) {
    const childSnaps = await Promise.all(
      chunk(frontier, 30).map((ids) => unitsCollection.where('parentUnitId', 'in', ids).get()),
    );
    const nextFrontier: string[] = [];
    for (const snap of childSnaps) {
      for (const d of snap.docs) {
        if (!allIds.has(d.id)) {
          allIds.add(d.id);
          nextFrontier.push(d.id);
        }
      }
    }
    frontier = nextFrontier;
  }
  return Array.from(allIds);
}

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
        const directUnitIds = managedUnitsSnap.docs
          .filter((d) => d.ref.parent.parent?.id === tenantId)
          .map((d) => d.id);
        const unitIds = await expandUnitIdsDownward(db, tenantId, directUnitIds);
        return { kind: 'unitAdmin', tenantId, unitIds };
      }
    }

    return { kind: 'denied' };
  } catch (err) {
    console.error(`[unitPermissionScope] resolution failed for uid=${uid} — failing CLOSED (denied)`, err);
    return { kind: 'denied' };
  }
}
