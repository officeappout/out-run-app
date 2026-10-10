/**
 * "פעילים באפליקציה" + "עברו מ'לא כשיר' ל'כשיר'" — a leading-indicators
 * strip at the TOP of the readiness dashboard (04.10.2026, §13.86), NOT a
 * new screen. Read-only, zero writes, zero new Firestore field/
 * collection, readiness-write.service.ts untouched. Deliberately a
 * SEPARATE file/concern from the readiness (green) numbers — these two
 * cards answer "is the app actually being used" and "is anyone actually
 * improving," neither of which is a readiness-pass/fail calculation and
 * neither should be mixed into one.
 *
 * === Card 1: app activity ===
 * Denominator = EVERY soldier on the roster in the caller's scope, not
 * just linked ones (David, explicit: "אם המכנה יהיה 'רק מקושרים', המספר
 * ייראה מצוין ולא יאמר כלום" — a denominator of linked-only would make
 * the percentage look great while saying nothing; "half the battalion
 * trains" is the useful statement). "Active" = a linked soldier (uid
 * set) with >=1 `workouts` doc in the last ACTIVE_WINDOW_DAYS days.
 *
 * Query shape deliberately mirrors the ALREADY-PRODUCTION-PROVEN pattern
 * in src/features/admin/services/analytics.service.ts's getActivityTrend
 * (same `workouts` collection, same `userId`+`date` composite index —
 * firestore.indexes.json:1011-1013 — already live, confirmed via a prior
 * investigation, no new index needed): chunk linked uids into batches of
 * <=30 (Firestore's `in` cap), run them in parallel, union the matching
 * `userId`s into one Set. ONE query per up-to-30 users, never one query
 * per user — the whole point, since this screen's own roster can grow
 * well past 30.
 *
 * === Card 2: fail→pass transitions ===
 * "ליד הראשון" of a category David expects more of later. Needs a real
 * "before" and "after" overall-status snapshot per soldier, which only
 * exists once a soldier has test results from >=2 DISTINCT test dates
 * (a single "מבדק" can't show a trend). With today's real data every
 * soldier has exactly one — so this returns null (not 0: 0 would claim
 * "we checked and nobody improved," which is a different, false claim
 * from "this can't be measured yet"). Deliberately recomputes an
 * "as-of" overall status (statusAsOf below) rather than reusing
 * computeSoldierCurrentStatus (readiness-write.service.ts, off-limits
 * this round) — that function always anchors to "now" and the single
 * latest result; this needs the SAME latest-valid-result logic anchored
 * to an arbitrary PAST date instead, which is a genuinely different
 * question, not a copy-paste duplication of the same one.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveReadinessTargetScope, UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';
import type { ReadinessSoldier, ReadinessResult, ReadinessThresholdsConfig, ReadinessCurrentStatus } from './readiness-write.service';
import { reduceOverallStatus, toDate } from './readiness-read.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בנתון זה.';
export const ACTIVE_WINDOW_DAYS = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface AppActivityUnitBreakdown {
  unitId: string;
  totalCount: number;
  linkedCount: number;
  activeCount: number;
}

export interface AppActivityBody {
  totalCount: number;
  linkedCount: number;
  activeCount: number;
  /** null only when totalCount === 0 (no roster at all) — 0 linked/0 active with a real roster still reports a real 0%, per David's explicit instruction (not an empty state). */
  activePercent: number | null;
  units: AppActivityUnitBreakdown[];
  /** null = not yet measurable (no soldier in scope has results from >=2 distinct test dates). A real number, including 0, once at least one soldier is eligible. */
  failToPassCount: number | null;
  /** How many soldiers currently HAVE >=2 distinct test dates (eligible to show a before/after at all) — 0 exactly when failToPassCount is null. Lets the UI caption the filled-in state ("מתוך N חיילים עם שני מבדקים") once it's no longer empty. */
  failToPassEligibleCount: number;
}

export type AppActivityResult =
  | { status: 200; body: AppActivityBody }
  | { status: 400 | 403 | 503; body: { error: string } };

/** One distinct calendar day per entry, most-recent first — a battery of tests administered the same day shares one entry regardless of how many result docs it produced. */
function distinctTestDatesDescending(results: ReadinessResult[]): Date[] {
  const byDayKey = new Map<number, Date>();
  for (const r of results) {
    const d = r.testDate;
    const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (!byDayKey.has(dayKey)) byDayKey.set(dayKey, d);
  }
  return Array.from(byDayKey.values()).sort((a, b) => b.getTime() - a.getTime());
}

/**
 * The soldier's overall status as it would have read on `asOf` — only
 * results whose OWN testDate is <= asOf are "known as of then" (testDate,
 * not recordedAt: this domain's own convention is that testDate is the
 * meaningful date throughout, see RosterSoldierTestDetail), the latest
 * of those by recordedAt is the one in force, and its validity window
 * (recordedAt + validityDays) is checked against asOf — same shape as
 * computeSoldierCurrentStatus, "now" replaced by an arbitrary past date.
 */
export function statusAsOf(results: ReadinessResult[], testIds: string[], asOf: Date): ReadinessCurrentStatus {
  if (testIds.length === 0) return 'not_yet_tested';
  const perTest = testIds.map((testId) => {
    const candidates = results
      .filter((r) => r.testId === testId && r.testDate.getTime() <= asOf.getTime())
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
    const latest = candidates[0];
    if (!latest) return 'not_yet_tested' as ReadinessCurrentStatus;
    const validityDays = latest.thresholdSnapshot?.validityDays ?? 365;
    const expiresAt = latest.recordedAt.getTime() + validityDays * 24 * 60 * 60 * 1000;
    if (asOf.getTime() > expiresAt) return 'not_yet_tested' as ReadinessCurrentStatus;
    return latest.outcome;
  });
  return reduceOverallStatus(perTest);
}

/**
 * null when no soldier has >=2 distinct test dates (nothing measurable
 * yet). Otherwise counts soldiers whose status as-of their PRIOR test
 * date was 'fail' and whose status as-of their MOST RECENT test date is
 * 'pass' — the earliest real before/after comparison each soldier has.
 */
export function computeFailToPassCount(
  soldiers: { results: ReadinessResult[] }[],
  testIds: string[],
): { count: number | null; eligibleCount: number } {
  let eligibleCount = 0;
  let transitionCount = 0;
  for (const s of soldiers) {
    const dates = distinctTestDatesDescending(s.results);
    if (dates.length < 2) continue;
    eligibleCount++;
    const [latest, prior] = dates;
    const previousStatus = statusAsOf(s.results, testIds, prior);
    const currentStatus = statusAsOf(s.results, testIds, latest);
    if (previousStatus === 'fail' && currentStatus === 'pass') transitionCount++;
  }
  return { count: eligibleCount === 0 ? null : transitionCount, eligibleCount };
}

export async function computeReadinessAppActivity(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<AppActivityResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  // 09.10.2026 (consolidation) — replaces the inline unitAdmin/tenantOwner/
  // vertical/root branching this function used to carry on its own. See
  // resolveReadinessTargetScope's own header comment for the full
  // contract — pure mechanical swap, zero behavior change.
  const scopeResult = await resolveReadinessTargetScope(db, scope, query);
  if (scopeResult.status !== 200) return scopeResult;
  const { targetTenantId, targetUnitIds } = scopeResult;

  const inScope = (unitId: unknown): boolean => {
    if (targetUnitIds === null) return true;
    return typeof unitId === 'string' && targetUnitIds.includes(unitId);
  };

  const [soldiersSnap, resultsSnap, thresholdsSnap] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_results').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
  ]);

  const config = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;
  const testIds = config?.tests.map((t) => t.id) ?? [];

  const resultsBySoldier = new Map<string, ReadinessResult[]>();
  for (const doc of resultsSnap.docs) {
    const data = doc.data() as Omit<ReadinessResult, 'id'>;
    if (!inScope(data.unitId)) continue;
    // §13.87 "תיקון מוצהר" — never count a superseded result.
    if (data.supersededByResultId) continue;
    const list = resultsBySoldier.get(data.soldierId) ?? [];
    list.push({ id: doc.id, ...data, recordedAt: toDate(data.recordedAt), testDate: toDate(data.testDate) });
    resultsBySoldier.set(data.soldierId, list);
  }

  const soldiers = soldiersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadinessSoldier, 'id'>) }))
    .filter((s) => !s.mergedInto && inScope(s.unitId));

  const linkedUids = Array.from(new Set(soldiers.filter((s) => !!s.uid).map((s) => s.uid as string)));

  const activeUidSet = new Set<string>();
  if (linkedUids.length > 0) {
    const cutoff = Timestamp.fromDate(new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    await Promise.all(
      chunk(linkedUids, 30).map(async (batch) => {
        const snap = await db
          .collection('workouts')
          .where('userId', 'in', batch)
          .where('date', '>=', cutoff)
          .select('userId')
          .get();
        snap.docs.forEach((d) => {
          const userId = d.data().userId;
          if (typeof userId === 'string') activeUidSet.add(userId);
        });
      }),
    );
  }

  const unitAcc = new Map<string, AppActivityUnitBreakdown>();
  const ensureUnitAcc = (unitId: string): AppActivityUnitBreakdown => {
    let acc = unitAcc.get(unitId);
    if (!acc) {
      acc = { unitId, totalCount: 0, linkedCount: 0, activeCount: 0 };
      unitAcc.set(unitId, acc);
    }
    return acc;
  };

  let totalCount = 0;
  let linkedCount = 0;
  let activeCount = 0;
  for (const s of soldiers) {
    totalCount++;
    const unitRow = ensureUnitAcc(s.unitId);
    unitRow.totalCount++;
    if (s.uid) {
      linkedCount++;
      unitRow.linkedCount++;
      if (activeUidSet.has(s.uid)) {
        activeCount++;
        unitRow.activeCount++;
      }
    }
  }

  const activePercent = totalCount > 0 ? Math.round((activeCount / totalCount) * 1000) / 10 : null;

  const { count: failToPassCount, eligibleCount: failToPassEligibleCount } = computeFailToPassCount(
    soldiers.map((s) => ({ results: resultsBySoldier.get(s.id) ?? [] })),
    testIds,
  );

  return {
    status: 200,
    body: {
      totalCount,
      linkedCount,
      activeCount,
      activePercent,
      units: Array.from(unitAcc.values()),
      failToPassCount,
      failToPassEligibleCount,
    },
  };
}
