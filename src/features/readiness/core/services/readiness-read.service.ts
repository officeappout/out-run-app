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
 * "ממתינים לשיוך" (pending-link) candidates — only self-declared users
 * ALREADY approved by an officer (core.unitApprovedByOfficer === true).
 * An unapproved self-declaration is not yet trusted enough to attach to
 * a real soldier's history — this reads the EXISTING self-declare/
 * approve flow's output, never modifies it (same users/{uid}.core.*
 * fields computeUnitMembers already reads, same single-field
 * core.tenantId query, filtered in memory for unitId/source/approval —
 * no new Firestore index).
 *
 * 02.10.2026 correction (David) — the approval gate above left a real
 * visibility gap: a self-declared-but-not-yet-approved user appeared
 * NOWHERE on this screen (not in `pending`, not in `soldiers`, no
 * indication they existed at all) — exactly the split this build was
 * meant to prevent, since an officer working only from this screen
 * would have no way to know there was a backlog waiting on a DIFFERENT
 * page (/admin/authority/units, where unitApprovedByOfficer is actually
 * flipped). Fixed by surfacing `unapprovedPendingCount` — a count only
 * (no names/uids, consistent with this route's existing privacy
 * posture) — so the UI can show "X declarations await officer approval"
 * with a pointer to where that approval actually happens. This does NOT
 * touch the approval flow itself, only reads its current state.
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
  type NotPerformedReason,
} from './readiness-write.service';

export interface RosterSoldierEntry {
  id: string;
  name: string;
  gender: ReadinessSoldier['gender'];
  uid: string | null;
  /**
   * 03.10.2026 — added for the results-entry screen, which (unlike the
   * roster screen's deliberate combined-command-span view) operates on
   * one unit at a time, matching how a real organized test is actually
   * administered. Lets the client filter the already-fetched roster by
   * unit without a second request.
   */
  unitId: string;
  linkedAt: string | null; // ISO, JSON-safe
  /**
   * Overall current status across every configured test, reduced from
   * computeSoldierCurrentStatus per test (see reduceOverallStatus below).
   * null only when no global threshold config exists yet (no tests
   * defined at all) — distinct from 'not_yet_tested', which means tests
   * exist but this soldier hasn't a valid result for any of them.
   */
  currentStatus: ReadinessCurrentStatus | null;
  /**
   * David, 02.10.2026: "לא ביצע" must show ITS reason, never be
   * conflated with "טרם נבדק" — an officer must not go chasing someone
   * who already has a recorded exemption. Populated only when
   * currentStatus === 'not_performed', from whichever test is currently
   * in that state (see findCurrentNotPerformedReason below).
   */
  notPerformedReason: NotPerformedReason | null;
  /**
   * 03.10.2026 — David, live-test finding: a live-test soldier showed
   * "לא כשיר" overall with empty entry fields, which looked like a bug
   * but was the correct, locked "one failure is enough" rule doing
   * exactly what it was told — the screen just gave no way to see WHICH
   * component was responsible, or whether its result was from today or
   * from weeks ago. "אסור שיוצג פסק דין בלי הראיה שמאחוריו" (no verdict
   * without the evidence behind it) — one entry per configured test,
   * always present regardless of session state, so the entry screen can
   * show the stored value/date/threshold next to the input field itself
   * rather than only the collapsed overall badge.
   */
  testDetails: RosterSoldierTestDetail[];
}

export interface RosterSoldierTestDetail {
  testId: string;
  /** This ONE test's own current status — never collapsed with the others (contrast currentStatus above, which IS the collapsed one). */
  status: ReadinessCurrentStatus;
  value: number | null;
  notPerformedReason: NotPerformedReason | null;
  /** ISO. The date the test actually happened (not recordedAt) — null when there's no current (valid, non-expired) result for this test. */
  testDate: string | null;
  /** The threshold this soldier's gender is compared against for this test — shown even when untested, so "what do I need to beat" is always visible (same number the header already shows globally, repeated per cell for convenience). */
  thresholdValue: number | null;
  lowerIsBetter: boolean | null;
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
  | { status: 200; body: { soldiers: RosterSoldierEntry[]; pending: RosterPendingEntry[]; units: RosterUnitEntry[]; unapprovedPendingCount: number } }
  | { status: 400 | 403 | 503; body: { error: string } };

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ברשימה זו.';

/**
 * Reduces one soldier's per-test current statuses to a single overall
 * signal for the roster's "תוצאה אחרונה" column. David's locked doctrine
 * (02.10.2026, קמל"ר — not a product choice): readiness = passing EVERY
 * component. One failing component fails the soldier overall; a 'pass'
 * overall requires ALL configured tests to individually read 'pass' —
 * moot today (production has zero readiness_results and no deployed
 * thresholds config, confirmed at merge time), but wrong order here
 * would silently mislabel a soldier "כשיר" the first time a second test
 * is ever added, so it's implemented correctly now rather than patched
 * later under pressure.
 *
 * Priority, most-severe/most-actionable first:
 *   1. any test 'fail'          → 'fail'   (one failure is enough — locked)
 *   2. else any test 'not_performed' → 'not_performed' (distinct from
 *      "untested" — point 1, 02.10.2026: an officer must not chase
 *      someone who already has a recorded exemption)
 *   3. else every test 'pass'   → 'pass'   (ALL components, not "any")
 *   4. else                      → 'not_yet_tested'
 */
export function reduceOverallStatus(perTest: ReadinessCurrentStatus[]): ReadinessCurrentStatus {
  if (perTest.includes('fail')) return 'fail';
  if (perTest.includes('not_performed')) return 'not_performed';
  if (perTest.length > 0 && perTest.every((s) => s === 'pass')) return 'pass';
  return 'not_yet_tested';
}

/**
 * computeSoldierCurrentStatus (readiness-write.service.ts, off-limits
 * this round) returns only the derived ENUM, not the underlying result —
 * so showing the EVIDENCE behind a status (its value, its date, which
 * threshold it was measured against — David, 03.10.2026: "אסור שיוצג
 * פסק דין בלי הראיה שמאחוריו") needs the full result object, not just
 * its outcome. Deliberately duplicates that function's validity-window
 * check (same recordedAt + thresholdSnapshot.validityDays comparison)
 * rather than editing the protected file — flagged as a candidate for a
 * future refactor (e.g. computeSoldierCurrentStatus returning the full
 * current result, not just its outcome) once that file is back in scope.
 * Used by both findCurrentNotPerformedReason (below) and the
 * per-test evidence built in computeUnitRoster.
 */
function findCurrentResult(results: ReadinessResult[], testId: string, now: Date): ReadinessResult | null {
  const forTest = results
    .filter((r) => r.testId === testId)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  const latest = forTest[0];
  if (!latest) return null;
  const validityDays = latest.thresholdSnapshot?.validityDays ?? 365;
  const expiresAt = latest.recordedAt.getTime() + validityDays * 24 * 60 * 60 * 1000;
  if (now.getTime() > expiresAt) return null;
  return latest;
}

function findCurrentNotPerformedReason(results: ReadinessResult[], testId: string, now: Date): NotPerformedReason | null {
  const current = findCurrentResult(results, testId, now);
  return current && current.outcome === 'not_performed' ? current.notPerformedReason : null;
}

/**
 * Normalizes a Firestore-read date-ish value to a real JS Date.
 *
 * 03.10.2026 production incident — the Admin SDK always returns
 * Firestore Timestamp instances (not plain JS Date) when reading back a
 * field that was written as `new Date()`. Every field typed `Date` in
 * ReadinessResult/ReadinessSoldier is affected the instant it's read
 * from Firestore — the type was never dishonest at WRITE time, only at
 * READ time, which is exactly why this stayed invisible: every test in
 * this build uses an in-memory fake db that hands back whatever JS
 * object was stored, never round-tripping through Firestore's real
 * serialization. The very first real readiness_results document ever
 * written hit this immediately: computeSoldierCurrentStatus (and this
 * file's own findCurrentNotPerformedReason) call `.getTime()` on
 * `recordedAt`, which a Timestamp does not have, and both threw
 * `TypeError: ...getTime is not a function`.
 *
 * Fixed ONCE, at the boundary where Firestore data becomes a
 * ReadinessResult object (the results loop below) — every downstream
 * consumer keeps calling `.getTime()` on `recordedAt`/`testDate`
 * exactly as before, because by the time they see it, it's genuinely a
 * Date, not because they were made Timestamp-aware individually.
 */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  throw new Error(`Expected a Date or Firestore Timestamp, got: ${typeof v}`);
}

/** Same Timestamp-vs-Date gap as toDate() above, for the one call site
 * (soldier.linkedAt) that tolerates absence instead of needing to throw —
 * an unlinked soldier's linkedAt is legitimately null, not a bug. */
function toIsoOrNull(d: unknown): string | null {
  if (d instanceof Date) return d.toISOString();
  if (d && typeof (d as { toDate?: unknown }).toDate === 'function') {
    return (d as { toDate: () => Date }).toDate().toISOString();
  }
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
    // Normalize at the boundary — see toDate()'s own comment. Without
    // this, computeSoldierCurrentStatus/findCurrentNotPerformedReason's
    // .getTime() calls throw on every real result (never on fake-db
    // test data, which is exactly how this shipped undetected).
    list.push({ id: doc.id, ...data, recordedAt: toDate(data.recordedAt), testDate: toDate(data.testDate) });
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
    const perTestStatus = testIds.map((testId) => computeSoldierCurrentStatus(soldierResults, testId, now));
    const currentStatus = testIds.length === 0 ? null : reduceOverallStatus(perTestStatus);
    const notPerformedReason = currentStatus === 'not_performed'
      ? (testIds.map((testId) => findCurrentNotPerformedReason(soldierResults, testId, now)).find((r) => r !== null) ?? null)
      : null;

    const testDetails: RosterSoldierTestDetail[] = (config?.tests ?? []).map((testDef) => {
      const current = findCurrentResult(soldierResults, testDef.id, now);
      return {
        testId: testDef.id,
        status: current ? current.outcome : 'not_yet_tested',
        value: current?.value ?? null,
        notPerformedReason: current?.notPerformedReason ?? null,
        testDate: current ? current.testDate.toISOString() : null,
        // Falls back to the test definition's live threshold when there's
        // no current result — "what do I need to beat" stays visible
        // even for an untested soldier, not just once they have a result.
        thresholdValue: current?.thresholdSnapshot?.thresholdValue ?? testDef.threshold?.[data.gender] ?? null,
        lowerIsBetter: current?.thresholdSnapshot?.lowerIsBetter ?? testDef.lowerIsBetter ?? null,
      };
    });

    soldiers.push({
      id: doc.id,
      name: data.name,
      gender: data.gender,
      unitId: data.unitId,
      notPerformedReason,
      uid: data.uid,
      linkedAt: toIsoOrNull(data.linkedAt),
      currentStatus,
      testDetails,
    });
  }
  soldiers.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const pending: RosterPendingEntry[] = [];
  let unapprovedPendingCount = 0;
  for (const doc of usersSnap.docs) {
    const core = (doc.data()?.core ?? {}) as Record<string, unknown>;
    if (!inScope(core.unitId)) continue;
    if (core.unitMembershipSource !== 'self_declared') continue;
    if (linkedUids.has(doc.id)) continue; // already linked to a readiness_soldiers record
    if (core.unitApprovedByOfficer !== true) {
      // Self-declared, not yet approved by an officer — not trusted
      // enough to offer for linking, but MUST still be surfaced as a
      // signal (count only, no name/uid) so this screen never looks
      // "complete" while a real backlog sits unseen on a different page.
      unapprovedPendingCount++;
      continue;
    }
    const rawGender = core.gender;
    const gender = rawGender === 'male' || rawGender === 'female' ? rawGender : null;
    pending.push({ uid: doc.id, name: typeof core.name === 'string' ? core.name : '', gender });
  }
  pending.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return { status: 200, body: { soldiers, pending, units, unapprovedPendingCount } };
}
