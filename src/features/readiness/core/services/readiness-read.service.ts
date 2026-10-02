/**
 * Readiness roster — read-only queries for the officer-facing "unit
 * soldiers" screen (02.10.2026, 00-MASTER-PLAN.md §13.6x, Stage 3 round 1).
 *
 * Deliberately a SEPARATE file from readiness-write.service.ts — David's
 * explicit instruction: "לא נוגע בשירות ולא במסלולים" (don't touch the
 * service or the routes already built and merged). That file's compute*()
 * write-chokepoint functions are untouched; this file only reads from the
 * same collections, using the same scope-resolution helpers
 * (isMemberWithinScope/resolveUnitPermissionScope — never reinvented) and
 * imports a few pure types/helpers from readiness-write.service.ts
 * read-only (ReadinessSoldier, ReadinessResult, computeSoldierCurrentStatus).
 *
 * Mirrors computeUnitMembers's (src/app/api/units/members/route.ts)
 * established scope-resolution shape exactly:
 *   - unitAdmin: every unit in their own resolved unitIds (already includes
 *     descendants, §13.28) — no per-unit navigation, one combined roster
 *     across their whole command span (David's explicit confirmation,
 *     02.10.2026: "מסך יחיד תחת 'מד כשירות' הקיים, כל היקף הפיקוד שלי").
 *   - tenantOwner: every unit under their own resolved tenantId.
 *   - root: no default domain — ?tenantId= required (400, not a security
 *     denial), ?unitId= optional to narrow to one unit.
 *   - denied/unknown: same fail-closed/503 split as every other route in
 *     this build.
 *
 * "ממתינים לשיוך" (pending-link) candidates — David's explicit decision
 * (02.10.2026, AskUserQuestion): only self-declared users ALREADY approved
 * by an officer (core.unitApprovedByOfficer === true). An unapproved
 * self-declaration is not yet trusted enough to attach to a real soldier's
 * history — this reads the EXISTING self-declare/approve flow's output,
 * never modifies it (same users/{uid}.core.* fields computeUnitMembers
 * already reads, same single-field core.tenantId query, filtered in
 * memory for unitId/source/approval — no new Firestore index).
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  isMemberWithinScope,
  UNIT_SCOPE_UNKNOWN_MESSAGE,
  type UnitPermissionScope,
} from '@/lib/unitPermissionScope';
import {
  computeSoldierCurrentStatus,
  type ReadinessSoldier,
  type ReadinessResult,
  type ReadinessCurrentStatus,
  type ReadinessThresholdsConfig,
} from './readiness-write.service';

export interface RosterSoldierEntry {
  id: string;
  name: string;
  gender: ReadinessSoldier['gender'];
  uid: string | null;
  linkedAt: string | null; // ISO, JSON-safe
  /**
   * Overall current status across every configured test, reduced from
   * computeSoldierCurrentStatus per test (see reduceOverallStatus below).
   * null only when no global threshold config exists yet (no tests
   * defined at all) — distinct from 'not_yet_tested', which means tests
   * exist but this soldier hasn't a valid result for any of them.
   */
  currentStatus: ReadinessCurrentStatus | null;
}

export interface RosterPendingEntry {
  uid: string;
  name: string;
  /**
   * From this account's own core.gender — null when absent or 'other'.
   * Mirrors computeCreateSoldier's own auto-fill rule exactly (only a
   * clean male/female core.gender ever auto-fills; 'other' always
   * requires explicit officer input) so the UI's pre-fill behavior
   * matches what the server would do, not a separate guess.
   */
  gender: 'male' | 'female' | null;
}

/**
 * Real units the caller may create a new readiness_soldiers record
 * under — needed because "add soldier"/"open new record" both require a
 * unitId in computeCreateSoldier's body, and a tenantOwner (or a
 * multi-unit unitAdmin) has more than one valid target. Resolved the
 * same way computeUnitMembers already resolves its own unit list
 * (src/app/api/units/members/route.ts) — not a new query shape.
 */
export interface RosterUnitEntry {
  id: string;
  name: string;
}

export type UnitRosterResult =
  | { status: 200; body: { soldiers: RosterSoldierEntry[]; pending: RosterPendingEntry[]; units: RosterUnitEntry[] } }
  | { status: 400 | 403 | 503; body: { error: string } };

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ברשימה זו.';

/**
 * Reduces one soldier's per-test current statuses to a single overall
 * signal for the roster's "תוצאה אחרונה" column. Policy (not explicitly
 * specified for the multi-test case — documented here so it's a visible,
 * revisitable choice, not a silent assumption; moot today since
 * production has zero readiness_results and no deployed thresholds
 * config, confirmed at merge time):
 *   any test 'fail' → 'fail' (a single failed test fails the soldier)
 *   else any test 'pass' → 'pass'
 *   else any test 'not_performed' → 'not_performed'
 *   else → 'not_yet_tested'
 */
function reduceOverallStatus(perTest: ReadinessCurrentStatus[]): ReadinessCurrentStatus {
  if (perTest.includes('fail')) return 'fail';
  if (perTest.includes('pass')) return 'pass';
  if (perTest.includes('not_performed')) return 'not_performed';
  return 'not_yet_tested';
}

function toIsoOrNull(d: unknown): string | null {
  if (d instanceof Date) return d.toISOString();
  return null;
}

export async function computeUnitRoster(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<UnitRosterResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  let targetTenantId: string;
  let targetUnitIds: string[] | null; // null = every unit under targetTenantId

  if (scope.kind === 'unitAdmin') {
    targetTenantId = scope.tenantId;
    targetUnitIds = scope.unitIds;
  } else if (scope.kind === 'tenantOwner') {
    targetTenantId = scope.tenantId;
    targetUnitIds = null;
  } else {
    // root — no "own" domain to default to, same as computeUnitMembers.
    if (!query.tenantId) {
      return { status: 400, body: { error: 'tenantId is required' } };
    }
    targetTenantId = query.tenantId;
    targetUnitIds = query.unitId ? [query.unitId] : null;
  }

  const inScope = (unitId: unknown): boolean => {
    if (targetUnitIds === null) return true;
    return typeof unitId === 'string' && targetUnitIds.includes(unitId);
  };

  const unitsCollection = db.collection('tenants').doc(targetTenantId).collection('units');
  const unitDocsPromise = targetUnitIds === null
    ? unitsCollection.get().then((snap) => snap.docs)
    : Promise.all(targetUnitIds.map((id) => unitsCollection.doc(id).get())).then((snaps) =>
        snaps.filter((s): s is FirebaseFirestore.QueryDocumentSnapshot => s.exists) as unknown as FirebaseFirestore.QueryDocumentSnapshot[],
      );

  const [soldiersSnap, resultsSnap, thresholdsSnap, usersSnap, unitDocs] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_results').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
    db.collection('users').where('core.tenantId', '==', targetTenantId).get(),
    unitDocsPromise,
  ]);

  const units: RosterUnitEntry[] = unitDocs.map((d) => ({
    id: d.id,
    name: typeof d.data()?.name === 'string' ? d.data()!.name : d.id,
  }));

  const config = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;
  const testIds = config?.tests.map((t) => t.id) ?? [];

  const resultsBySoldier = new Map<string, ReadinessResult[]>();
  for (const doc of resultsSnap.docs) {
    const data = doc.data() as Omit<ReadinessResult, 'id'>;
    if (!inScope(data.unitId)) continue;
    const list = resultsBySoldier.get(data.soldierId) ?? [];
    list.push({ id: doc.id, ...data });
    resultsBySoldier.set(data.soldierId, list);
  }

  const now = new Date();
  const linkedUids = new Set<string>();
  const soldiers: RosterSoldierEntry[] = [];
  for (const doc of soldiersSnap.docs) {
    const data = doc.data() as Omit<ReadinessSoldier, 'id'>;
    if (data.mergedInto) continue; // merged-away records never show in the roster
    if (!inScope(data.unitId)) continue;
    if (data.uid) linkedUids.add(data.uid);

    const soldierResults = resultsBySoldier.get(doc.id) ?? [];
    const currentStatus = testIds.length === 0
      ? null
      : reduceOverallStatus(testIds.map((testId) => computeSoldierCurrentStatus(soldierResults, testId, now)));

    soldiers.push({
      id: doc.id,
      name: data.name,
      gender: data.gender,
      uid: data.uid,
      linkedAt: toIsoOrNull(data.linkedAt),
      currentStatus,
    });
  }
  soldiers.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const pending: RosterPendingEntry[] = [];
  for (const doc of usersSnap.docs) {
    const core = (doc.data()?.core ?? {}) as Record<string, unknown>;
    if (!inScope(core.unitId)) continue;
    if (core.unitMembershipSource !== 'self_declared') continue;
    if (core.unitApprovedByOfficer !== true) continue;
    if (linkedUids.has(doc.id)) continue; // already linked to a readiness_soldiers record
    const rawGender = core.gender;
    const gender = rawGender === 'male' || rawGender === 'female' ? rawGender : null;
    pending.push({ uid: doc.id, name: typeof core.name === 'string' ? core.name : '', gender });
  }
  pending.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return { status: 200, body: { soldiers, pending, units } };
}
