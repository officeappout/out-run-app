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
 * Firestore read in this function is wrapped in ONE try/catch — a missing
 * index, a transient outage, a timeout, or a bug never propagates to a
 * caller that might (now or later) treat a thrown error as anything other
 * than "no access." rateLimit.ts fails open because letting one extra
 * request through during an outage is cheap; this function fails closed
 * because the cost of the equivalent mistake here is a stranger approving
 * or reading someone else's unit membership.
 *
 * P1-3 item 1 (00-MASTER-PLAN.md §13.43/§13.49) — fail-CLOSED for
 * authorization is unchanged by this: the catch block still always denies
 * access. What changed is that it no longer calls that outcome the SAME
 * thing as a real, checked "no" — this is exactly the production incident
 * that motivated it (00-MASTER-PLAN.md §13.47/§13.48's standing rule:
 * "המערכת לעולם לא מדווחת 'לא' כשהיא מתכוונת 'לא הצלחתי לבדוק'"). A missing
 * collectionGroup index made a real unit_admin's FIRST-EVER attempt to view
 * their own unit look identical, at every layer, to a stranger being
 * correctly refused — because both collapsed into `{kind:'denied'}`.
 *   - `denied` — every read SUCCEEDED and none of them found this uid in
 *     root/tenantOwner/unitAdmin. A real, checked "no."
 *   - `unknown` — a read THREW (whatever the cause). We genuinely do not
 *     know whether this uid has access; access is still refused (fail-
 *     closed for authorization purposes is not negotiable), but every
 *     consumer of this scope must report THAT distinction to whoever hit
 *     it — "we couldn't verify your access, try again" is a materially
 *     different, and materially less alarming/misleading, message than
 *     "you don't have access to this."
 */
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { tenantTypeOf } from '@/lib/tenantType';

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

/**
 * 06.10.2026 ("chief fitness officer" scoping, David's explicit
 * instruction) — EXTENDS this union rather than inventing a parallel
 * grant mechanism. Reuses the EXACT shape already live in
 * adminAnalyticsScope.ts's AdminAnalyticsScope (`{kind:'vertical',
 * vertical, authorityIds}`), and the EXACT same grant fields
 * (`core.isVerticalAdmin`, `core.managedVertical`) already written by
 * the real, reviewable admin-directory/admins-management UI — no
 * second place that grants cross-organization access, no new flag.
 * `authorityIds` is pre-filtered to this caller's own vertical ONLY
 * (never the whole authorities collection) — see
 * resolveUnitPermissionScope's own vertical branch below.
 */
export type UnitPermissionScope =
  | { kind: 'root' }
  | { kind: 'tenantOwner'; tenantId: string }
  | { kind: 'unitAdmin'; tenantId: string; unitIds: string[] }
  | { kind: 'vertical'; vertical: string; authorityIds: string[] }
  | { kind: 'denied' }
  | { kind: 'unknown' };

/**
 * The ONE generic "we couldn't verify" message every route-facing consumer
 * should show — deliberately uniform (unlike each route's own
 * action-specific DENIED_MESSAGE) because the failure mode itself is the
 * same regardless of which action was being attempted: a transient
 * inability to check, not a considered refusal. Paired status: 503.
 */
export const UNIT_SCOPE_UNKNOWN_MESSAGE =
  'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע, ואם זה חוזר — פנה למנהל המערכת.';

/**
 * Is a SPECIFIC member (identified by their own core.tenantId/unitId,
 * read from their user doc — never client-supplied) within an
 * already-resolved caller scope? root — anyone. tenantOwner — same
 * tenantId. unitAdmin — same tenantId AND unitId in scope.unitIds
 * (already includes every descendant unit, §13.28's downward
 * inheritance — "the unit's own admin, OR a commander above it in the
 * hierarchy" falls out of this for free, no separate check needed).
 *
 * Extracted 26.09.2026 (§13.32) from GET /api/units/member-workouts's own
 * local isAuthorizedForMember, which is now this function under a new
 * name — POST /api/units/members/approve and .../remove need the
 * identical check and this avoids a 3rd independent copy of the same
 * authorization rule (a real consistency risk: a future fix to this rule
 * landing in only 1-2 of 3 copies). member-workouts/route.ts was updated
 * to import this instead of keeping its own copy.
 */
export function isMemberWithinScope(
  scope: UnitPermissionScope,
  memberTenantId: unknown,
  memberUnitId: unknown,
): boolean {
  if (scope.kind === 'root') return true;
  if (scope.kind === 'tenantOwner') return memberTenantId === scope.tenantId;
  if (scope.kind === 'unitAdmin') {
    return memberTenantId === scope.tenantId && typeof memberUnitId === 'string' && scope.unitIds.includes(memberUnitId);
  }
  // 'denied' and 'unknown' both fall through to false here — correct for
  // fail-closed AUTHORIZATION either way. Callers that want to report the
  // two differently (P1-3 item 1) must check scope.kind BEFORE calling
  // this, same as they already do for 'denied' — see e.g.
  // computeMemberWorkouts/computeRemoveMember/computeApproveMember.
  return false;
}

/**
 * 09.10.2026 (adversarial-audit consolidation, built in isolation — zero
 * existing call site touched by this commit) — the chokepoint 8 readiness/
 * units read functions (computeUnitRoster, computeReadinessAppActivity,
 * computeReadinessTrends, computeRosterWorkoutSummary, computeBrigadeDashboard,
 * computeUnitMembers, computeUnitStructure, computeTrainingWeeklyShift) each
 * independently re-implemented: turning an already-resolved `scope` plus a
 * client-supplied `{tenantId, unitId}` into a concrete, in-scope
 * (targetTenantId, targetUnitIds) to query against. That duplication is
 * exactly how the 08.10.2026 cross-tenant leak happened — 4 of the 8 copies
 * were missing the `scope.authorityIds.includes(tenantId)` check the other
 * 4 already had, because there was no single template to copy that was
 * guaranteed correct. This function replaces all 8 copies with one.
 *
 * Does NOT replace isMemberWithinScope above — that answers a different
 * question ("is this ALREADY-KNOWN tenantId/unitId, read from a specific
 * target record, within scope" — a boolean membership check used by WRITE
 * paths that already have a record in hand). This function answers "what
 * IS the target tenant/unit domain for a LISTING/read-all operation,
 * resolved from the caller's scope and their own query" — a routing
 * decision, not a membership check, which is why it returns concrete IDs
 * (or a rejection) instead of a boolean.
 *
 * Contract (status codes are picked from whichever of the 8 existing call
 * sites already had the strictest version for that branch — this function
 * does not invent new status-code semantics):
 *   - 'unknown' → 503 (verification failed, not a checked "no")
 *   - 'denied'  → 403
 *   - 'unitAdmin': own tenant (scope.tenantId). If query.unitId is given,
 *     it MUST be in scope.unitIds (403 if not) — no extra DB read needed,
 *     scope.unitIds is already a real, existence-confirmed list
 *     (resolveUnitPermissionScope's expandUnitIdsDownward). If omitted,
 *     every unit in scope.unitIds.
 *   - 'tenantOwner': own tenant (scope.tenantId) — never the client's
 *     tenantId, which is ALWAYS ignored for this scope kind (if a caller
 *     sends a different tenantId it is silently irrelevant, not a
 *     bypass — confirmed by the adversarial audit's own control test).
 *     If query.unitId is given, it is existence-checked against
 *     tenants/{tenantId}/units/{unitId} — 403 if it doesn't exist, since
 *     this is the caller's OWN tenant and a bogus unitId here reads as
 *     "not yours" (matches the existing majority precedent —
 *     computeUnitMembers, computeRosterWorkoutSummary). If omitted, every
 *     unit under the tenant (targetUnitIds: null).
 *   - 'vertical': query.tenantId is REQUIRED (400 if missing — no single
 *     own tenant to default to) and MUST be in scope.authorityIds (403 if
 *     not — this is the exact check the 08.10.2026 security fix added).
 *     If query.unitId is given, it is existence-checked the same way —
 *     400 "unit not found" (not 403: the caller has no inherent ownership
 *     claim over the selected tenant the way tenantOwner does, matching
 *     computeUnitStructure's existing precedent for this branch).
 *   - 'root': query.tenantId is REQUIRED (400 if missing) and trusted
 *     blindly — root has no scope boundary of its own. query.unitId (if
 *     given) is existence-checked the same way as vertical's — 400 "unit
 *     not found".
 *
 * A bogus/foreign unitId can NEVER cause a cross-tenant leak through this
 * function even where no existence check fires: targetTenantId is always
 * resolved FIRST and is always either the caller's own real tenant
 * (unitAdmin/tenantOwner) or a tenantId already confirmed in scope
 * (vertical) or root's trusted input — every downstream query a caller
 * builds from this function's result is expected to filter by
 * targetTenantId before ever looking at targetUnitIds (confirmed true for
 * all 8 existing call sites as of this audit — see the adversarial-audit
 * commit's "אי-התאמה B" verification).
 */
export type ReadinessTargetScopeResult =
  | { status: 200; targetTenantId: string; targetUnitIds: string[] | null }
  | { status: 400 | 403 | 503; body: { error: string } };

const READINESS_TARGET_SCOPE_DENIED_MESSAGE = 'אין לך הרשאה לצפות בנתון זה.';

export async function resolveReadinessTargetScope(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<ReadinessTargetScopeResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: READINESS_TARGET_SCOPE_DENIED_MESSAGE } };
  }

  if (scope.kind === 'unitAdmin') {
    if (query.unitId) {
      if (!scope.unitIds.includes(query.unitId)) {
        return { status: 403, body: { error: READINESS_TARGET_SCOPE_DENIED_MESSAGE } };
      }
      return { status: 200, targetTenantId: scope.tenantId, targetUnitIds: [query.unitId] };
    }
    return { status: 200, targetTenantId: scope.tenantId, targetUnitIds: scope.unitIds };
  }

  if (scope.kind === 'tenantOwner') {
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(scope.tenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 403, body: { error: READINESS_TARGET_SCOPE_DENIED_MESSAGE } };
      }
      return { status: 200, targetTenantId: scope.tenantId, targetUnitIds: [query.unitId] };
    }
    return { status: 200, targetTenantId: scope.tenantId, targetUnitIds: null };
  }

  if (scope.kind === 'vertical') {
    if (!query.tenantId) {
      return { status: 400, body: { error: 'tenantId is required' } };
    }
    if (!scope.authorityIds.includes(query.tenantId)) {
      return { status: 403, body: { error: READINESS_TARGET_SCOPE_DENIED_MESSAGE } };
    }
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(query.tenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 400, body: { error: 'unit not found' } };
      }
      return { status: 200, targetTenantId: query.tenantId, targetUnitIds: [query.unitId] };
    }
    return { status: 200, targetTenantId: query.tenantId, targetUnitIds: null };
  }

  // scope.kind === 'root' — no "own" domain to default to.
  if (!query.tenantId) {
    return { status: 400, body: { error: 'tenantId is required' } };
  }
  if (query.unitId) {
    const unitSnap = await db.collection('tenants').doc(query.tenantId).collection('units').doc(query.unitId).get();
    if (!unitSnap.exists) {
      return { status: 400, body: { error: 'unit not found' } };
    }
    return { status: 200, targetTenantId: query.tenantId, targetUnitIds: [query.unitId] };
  }
  return { status: 200, targetTenantId: query.tenantId, targetUnitIds: null };
}

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

    // "Chief fitness officer" — 06.10.2026, REWIRED from the original
    // (frozen, never-live) design. Was: core.isVerticalAdmin +
    // core.managedVertical — discovered to be a global-admin-adjacent
    // flag (sets `admin=true` in computeAdminScope, bypasses hasSec(),
    // reused as an admin-gate by 3 Cloud Functions — see axioms.md §32
    // and parking-lot.md). Now reads a brand-new, dedicated field this
    // feature owns outright: core.isReadinessChiefOfficer. Never
    // core.isVerticalAdmin, never core.isAdmin, never a hasSec() input —
    // confirmed by grep, not assumed. `vertical` is hardcoded to
    // 'military' (not read from core.managedVertical) because this flag
    // has exactly one meaning; if a second vertical ever needs this
    // pattern, it gets its own dedicated field, not a shared one.
    //
    // This file's own root→tenantOwner→unitAdmin precedence above is
    // untouched and checked first, so an existing brigade officer's scope
    // is byte-for-byte unchanged. KNOWN TRAP (David, 06.10.2026,
    // deliberately left as-is — the direction is safe and not being
    // changed): because this check runs LAST, an account that is BOTH a
    // real tenantOwner/unitAdmin for some brigade AND a chief-fitness-
    // officer (core.isReadinessChiefOfficer) will ALWAYS resolve to the
    // narrower tenantOwner/unitAdmin scope — silently, with no error. If
    // a real dual-role account ever needs both, this precedence is the
    // reason to look at first. See parking-lot.md.
    if (core.isReadinessChiefOfficer === true) {
      const vertical: 'military' = 'military';
      const authoritiesSnap = await db.collection('authorities').select('type').get();
      const authorityIds = authoritiesSnap.docs
        .filter((d) => tenantTypeOf((d.data().type as string) ?? '') === vertical)
        .map((d) => d.id);
      return { kind: 'vertical', vertical, authorityIds };
    }

    return { kind: 'denied' };
  } catch (err) {
    console.error(`[unitPermissionScope] resolution failed for uid=${uid} — failing CLOSED (unknown, not denied — a real check never ran)`, err);
    return { kind: 'unknown' };
  }
}
