/**
 * Brigade readiness dashboard — read-only aggregate statistics (Stage 4,
 * 03.10.2026, 00-MASTER-PLAN.md §13.74). A separate file from both
 * readiness-write.service.ts (untouched, as every round) and
 * readiness-read.service.ts (the roster/entry data source) — this file
 * answers a structurally different question ("how is my brigade doing
 * overall") rather than "who is in my roster." Imports
 * reduceOverallStatus/toDate read-only from readiness-read.service.ts
 * (both exported specifically for this) and computeSoldierCurrentStatus
 * read-only from readiness-write.service.ts — nothing reinvented, same
 * scope-resolution pattern as every other route in this build.
 *
 * Five iron rules, all from David's locked spec (03.10.2026):
 *  1. "Not yet tested" is a PRIMARY datum, not a remainder — always
 *     computed and surfaced as its own number+percent, never implied by
 *     subtraction in the UI layer alone.
 *  2. Every percentage ships with its own denominator ("29 מתוך 41",
 *     never a bare "72%") — and that denominator is TESTED soldiers
 *     (pass+fail), never total soldiers. The UI states this in words.
 *  3. A unit with zero tested soldiers reports percent as `null`
 *     (rendered "טרם נבדקה" — never "0%", which would read as total
 *     failure instead of absent data).
 *  4. Every unit row carries its own last-update date (the most recent
 *     testDate among its soldiers' organized_test results) — two units
 *     reading the same percentage from different months are not
 *     equivalent, and the UI must not let them look that way.
 *  5. ONLY source === 'organized_test' counts here — app measurements
 *     and self-reports are real, legitimate sources everywhere else in
 *     this build (the roster/entry screens correctly consider all three),
 *     but THIS screen is explicitly scoped to organized testing only,
 *     filtered out of the results array before any aggregation runs
 *     below, stated explicitly in the UI's own footer.
 *
 * Explicitly NOT built, per instruction: no "test cycle" entity (doesn't
 * exist in the data model), no date-range filter (not declared required
 * this round), no cross-brigade comparison, no trend charts (blocked by
 * §13.69's open correction-marking decision — a trend line would render
 * a typo as a genuine readiness decline).
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIT_SCOPE_UNKNOWN_MESSAGE,
  type UnitPermissionScope,
} from '@/lib/unitPermissionScope';
import {
  computeSoldierCurrentStatus,
  type ReadinessSoldier,
  type ReadinessResult,
  type ReadinessThresholdsConfig,
} from './readiness-write.service';
import { reduceOverallStatus, toDate } from './readiness-read.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בלוח זה.';

export interface DashboardOverallBreakdown {
  totalCount: number;
  passCount: number;
  failCount: number;
  /** Soldiers whose CURRENT state (per the collapsed, all-must-pass rule) is 'not_performed' on at least one component and none are 'fail' — has a recorded exemption/no-show, no verdict, intentionally kept visible rather than folded away (§13.71's own lesson: don't make an officer chase someone who already has a recorded exemption). */
  notPerformedCount: number;
  /** Never tested at all — the true "no information yet" bucket, distinct from notPerformedCount above. */
  notYetTestedCount: number;
  /** passCount + failCount — the denominator for passPercent, point 2. */
  testedCount: number;
  /** null when testedCount === 0 (point 3) — render "טרם נבדקה", never "0%". */
  passPercent: number | null;
}

export interface DashboardComponentBreakdown {
  testId: string;
  label: string;
  unit: string;
  passCount: number;
  failCount: number;
  testedCount: number;
  passPercent: number | null;
  thresholdMale: number | null;
  thresholdFemale: number | null;
}

export interface DashboardUnitRow {
  unitId: string;
  unitName: string;
  totalCount: number;
  testedCount: number;
  overallPassPercent: number | null;
  perComponent: Record<string, { testedCount: number; passPercent: number | null }>;
  /** ISO, the most recent testDate among this unit's soldiers' organized_test results. null if none. */
  lastTestDate: string | null;
}

export type BrigadeDashboardResult =
  | {
      status: 200;
      body: {
        overall: DashboardOverallBreakdown;
        components: DashboardComponentBreakdown[];
        units: DashboardUnitRow[];
      };
    }
  | { status: 400 | 403 | 503; body: { error: string } };

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}

export async function computeBrigadeDashboard(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<BrigadeDashboardResult> {
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
    // root — no "own" domain to default to, same as computeUnitRoster/computeUnitMembers.
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

  const [soldiersSnap, resultsSnap, thresholdsSnap, unitDocs] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_results').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
    unitDocsPromise,
  ]);

  const unitNameById = new Map<string, string>();
  for (const d of unitDocs) {
    unitNameById.set(d.id, typeof d.data()?.name === 'string' ? d.data()!.name : d.id);
  }

  const config = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;
  const testIds = config?.tests.map((t) => t.id) ?? [];

  // Point 5 — organized_test only, filtered BEFORE any aggregation.
  const resultsBySoldier = new Map<string, ReadinessResult[]>();
  for (const doc of resultsSnap.docs) {
    const data = doc.data() as Omit<ReadinessResult, 'id'>;
    if (!inScope(data.unitId)) continue;
    if (data.source !== 'organized_test') continue;
    const list = resultsBySoldier.get(data.soldierId) ?? [];
    list.push({ id: doc.id, ...data, recordedAt: toDate(data.recordedAt), testDate: toDate(data.testDate) });
    resultsBySoldier.set(data.soldierId, list);
  }

  const now = new Date();

  // Per-unit accumulators, seeded for EVERY real unit in scope (point 3's
  // "never silently hide a zero-data unit" — a unit with no soldiers at
  // all still gets a row, "טרם נבדקה").
  interface UnitAcc {
    totalCount: number;
    passCount: number;
    failCount: number;
    perComponent: Record<string, { passCount: number; failCount: number }>;
    lastTestMs: number | null;
  }
  const unitAcc = new Map<string, UnitAcc>();
  const ensureUnitAcc = (unitId: string): UnitAcc => {
    let acc = unitAcc.get(unitId);
    if (!acc) {
      acc = { totalCount: 0, passCount: 0, failCount: 0, perComponent: {}, lastTestMs: null };
      for (const testId of testIds) acc.perComponent[testId] = { passCount: 0, failCount: 0 };
      unitAcc.set(unitId, acc);
    }
    return acc;
  };
  for (const d of unitDocs) ensureUnitAcc(d.id); // seed every real unit, even with zero soldiers

  const brigadeComponentAcc: Record<string, { passCount: number; failCount: number }> = {};
  for (const testId of testIds) brigadeComponentAcc[testId] = { passCount: 0, failCount: 0 };

  let totalCount = 0;
  let passCount = 0;
  let failCount = 0;
  let notPerformedCount = 0;
  let notYetTestedCount = 0;

  for (const doc of soldiersSnap.docs) {
    const data = doc.data() as Omit<ReadinessSoldier, 'id'>;
    if (data.mergedInto) continue;
    if (!inScope(data.unitId)) continue;

    totalCount++;
    const unitRow = ensureUnitAcc(data.unitId);
    unitRow.totalCount++;

    const soldierResults = resultsBySoldier.get(doc.id) ?? [];
    const perTestStatus = testIds.map((testId) => computeSoldierCurrentStatus(soldierResults, testId, now));
    const overall = testIds.length === 0 ? 'not_yet_tested' : reduceOverallStatus(perTestStatus);

    if (overall === 'pass') passCount++;
    else if (overall === 'fail') failCount++;
    else if (overall === 'not_performed') notPerformedCount++;
    else notYetTestedCount++;

    if (overall === 'pass') unitRow.passCount++;
    else if (overall === 'fail') unitRow.failCount++;
    // not_performed/not_yet_tested soldiers don't add to the unit's
    // pass/fail counters — they're absent from the tested denominator,
    // exactly like the brigade-wide figures below.

    testIds.forEach((testId, i) => {
      const status = perTestStatus[i];
      if (status === 'pass') {
        brigadeComponentAcc[testId].passCount++;
        unitRow.perComponent[testId].passCount++;
      } else if (status === 'fail') {
        brigadeComponentAcc[testId].failCount++;
        unitRow.perComponent[testId].failCount++;
      }
    });

    for (const r of soldierResults) {
      const ms = r.testDate.getTime();
      if (unitRow.lastTestMs === null || ms > unitRow.lastTestMs) unitRow.lastTestMs = ms;
    }
  }

  const testedCount = passCount + failCount;
  const overall: DashboardOverallBreakdown = {
    totalCount,
    passCount,
    failCount,
    notPerformedCount,
    notYetTestedCount,
    testedCount,
    passPercent: pct(passCount, testedCount),
  };

  const components: DashboardComponentBreakdown[] = (config?.tests ?? []).map((t) => {
    const acc = brigadeComponentAcc[t.id] ?? { passCount: 0, failCount: 0 };
    const testedForComponent = acc.passCount + acc.failCount;
    return {
      testId: t.id,
      label: t.label,
      unit: t.unit,
      passCount: acc.passCount,
      failCount: acc.failCount,
      testedCount: testedForComponent,
      passPercent: pct(acc.passCount, testedForComponent),
      thresholdMale: t.threshold?.male ?? null,
      thresholdFemale: t.threshold?.female ?? null,
    };
  });

  const units: DashboardUnitRow[] = Array.from(unitAcc.entries()).map(([unitId, acc]) => {
    const unitTested = acc.passCount + acc.failCount;
    const perComponent: Record<string, { testedCount: number; passPercent: number | null }> = {};
    for (const testId of testIds) {
      const c = acc.perComponent[testId];
      const testedForComponent = c.passCount + c.failCount;
      perComponent[testId] = { testedCount: testedForComponent, passPercent: pct(c.passCount, testedForComponent) };
    }
    return {
      unitId,
      unitName: unitNameById.get(unitId) ?? unitId,
      totalCount: acc.totalCount,
      testedCount: unitTested,
      overallPassPercent: pct(acc.passCount, unitTested),
      perComponent,
      lastTestDate: acc.lastTestMs !== null ? new Date(acc.lastTestMs).toISOString() : null,
    };
  });
  units.sort((a, b) => a.unitName.localeCompare(b.unitName, 'he'));

  return { status: 200, body: { overall, components, units } };
}
