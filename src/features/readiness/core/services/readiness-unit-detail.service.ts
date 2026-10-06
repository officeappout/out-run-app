/**
 * Unit-detail screen (Stage 7, 03.10.2026, 00-MASTER-PLAN.md §13.80) —
 * what opens when clicking a unit row on the dashboard table. Same data
 * the dashboard already shows, narrowed to ONE unit, plus that unit's
 * own soldiers. Read-only — no write path exists here at all.
 *
 * David's explicit instruction: don't invent new data sources. This
 * file is a thin combining layer over two existing, unmodified
 * functions:
 *   - computeBrigadeDashboard (readiness-dashboard.service.ts) — reused
 *     AS-IS, unscoped by unitId, so it returns every unit the caller's
 *     own scope already permits (exactly what the existing dashboard
 *     table already fetches). This file finds the target row + its
 *     children + its subtree within that SAME flat result — no new
 *     Firestore query, no change to that function's own scope-
 *     narrowing logic.
 *   - computeUnitRoster (readiness-read.service.ts) — reused AS-IS,
 *     unscoped by unitId, for the same reason; this file filters its
 *     `soldiers` array to this one unit's own soldiers, exactly the
 *     same client-side-filter idiom the existing entry screen already
 *     uses for `s.unitId === selectedUnitId`.
 *
 * Authorization: if the requested unitId isn't in the caller's own
 * scope.unitIds (unitAdmin) or doesn't exist as a real unit under
 * their tenant (tenantOwner/root), it simply never appears in
 * computeBrigadeDashboard's own `units` array — "not found" and "found
 * but out of scope" are deliberately indistinguishable from the
 * caller's side (same DENIED_MESSAGE, same 403), never leaking which
 * case it was (axiom §25's own reasoning, applied here).
 *
 * The locked rule, verbatim (David, 03.10.2026): "כל רמה סופרת רק את
 * החיילים ששייכים לה ישירות... זה מכוון ולא באג." The "own" card/table
 * below is already exactly this — DashboardUnitRow's own views/
 * perComponent were ALREADY computed per-soldier's own unitId, never
 * rolled up from descendants (confirmed by computeBrigadeDashboard's
 * own ensureUnitAcc(data.unitId) keying). The "cumulative" figure is
 * the one NEW piece of arithmetic this file adds — a straight sum of
 * the target unit's own views.all plus every descendant's, across the
 * resolved subtree (walked via DashboardUnitRow.parentUnitId, which is
 * itself already resolved from unitDirectory — see that file's header
 * for why a unit's own, almost-never-populated parentUnitId field
 * can't be used directly).
 *
 * "חלקי" (partial) — a table-display-only status, not a new stored
 * value and not a change to the locked reduceOverallStatus priority
 * (readiness-read.service.ts, untouched). A soldier's overall status
 * ('fail'/'not_performed'/'pass'/'not_yet_tested') is read verbatim
 * from computeUnitRoster's own currentStatus; "partial" is carved out
 * ONLY for display, distinguishing a not_yet_tested soldier with ZERO
 * real results (true "טרם נבדק") from one with SOME but not all
 * configured tests measured (no fail among them, by construction —
 * the fail branch would already have fired otherwise). Filter chips
 * use the real currentStatus values only (4 buckets); "partial" never
 * gets its own chip, only its own sort position and table label.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';
import {
  computeBrigadeDashboard,
  type DashboardOverallBreakdown,
  type DashboardComponentBreakdown,
  type DashboardUnitRow,
} from './readiness-dashboard.service';
import { computeUnitRoster, reduceOverallStatus } from './readiness-read.service';
import type { ReadinessCurrentStatus, NotPerformedReason, ReadinessThresholdsConfig } from './readiness-write.service';
import type { NearThresholdInfo } from './readiness-near-threshold';
// 06.10.2026 — training-derived (app workout data) value, per soldier
// per test, alongside the official test value this file already shows.
// RUN_TEST_ID below (line ~70) is the same value the shared module's
// own RUN_TEST_ID holds — reused directly, no alias needed.
import { computeDemonstratedStrengthLevels } from './readiness-strength-level.service';
import { computeDemonstratedRunLevels } from './readiness-run-level.service';
import { PULL_TEST_ID, PUSH_TEST_ID, runMeetsStatus, strengthMeetsStatus } from './readiness-training-status.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ביחידה זו.';

const RUN_TEST_ID = 'run_3000m';
const STRENGTH_TEST_IDS = ['pullups', 'dips'];

const NOT_PERFORMED_REASON_LABEL: Record<NotPerformedReason, string> = {
  medical_exemption: 'פטור רפואי',
  no_show: 'לא הופיע',
  other: 'אחר',
};

/** Level-correct Hebrew for the mandatory "own-only" explanation (David, verbatim example: "המספרים למעלה סופרים את הגדוד עצמו בלבד — לא את הפלוגות"). Falls back to battalion/company wording when a level is missing — unitDirectory sync should always populate this in practice, but the sentence must still read correctly if it hasn't caught up yet. */
const LEVEL_OWN_PHRASE: Record<string, string> = {
  brigade: 'החטיבה עצמה',
  battalion: 'הגדוד עצמו',
  company: 'הפלוגה עצמה',
  platoon: 'המחלקה עצמה',
};
const LEVEL_PLURAL: Record<string, string> = {
  brigade: 'החטיבות',
  battalion: 'הגדודים',
  company: 'הפלוגות',
  platoon: 'המחלקות',
};

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface UnitDetailBreadcrumbSegment {
  /** null for the brigade segment — it isn't a navigable unit-detail page, it links to the main dashboard instead. */
  unitId: string | null;
  name: string;
}

export interface UnitDetailChildSummary {
  unitId: string;
  unitName: string;
  totalCount: number;
  testedCount: number;
  passPercent: number | null;
}

export interface UnitDetailSoldierTest {
  testId: string;
  value: number | null;
  testDate: string | null;
  thresholdValue: number | null;
  /** True when this value is the test's own default (male) threshold — the UI shows the threshold line ONLY when this is false, so a routine male result never gets a redundant "סף: X" underneath it. */
  isDefaultThreshold: boolean;
  status: ReadinessCurrentStatus;
  /** This specific test's own status is 'fail' — the ONLY cells that get the red highlight (never a whole row, never a whole group). */
  isFailCause: boolean;
  /**
   * 06.10.2026 — training-derived (app workout data) value, NOT the
   * official test above. Same unit as `value` (reps for pull/push,
   * normalized 3,000m-equivalent seconds for run) — directly
   * comparable to `thresholdValue`. null = no training evidence in the
   * 30-day window (unlinked soldier, or not enough qualifying
   * performances) — render a dash, never a false "0".
   */
  trainingValue: number | null;
  /** trainingValue's own meets/fails verdict via runMeetsStatus/strengthMeetsStatus — 'not_yet_tested' whenever trainingValue is null. */
  trainingStatus: ReadinessCurrentStatus;
  /**
   * How far below the threshold trainingValue is, in the SAME unit as
   * trainingValue — a positive number meaning "needs this much more to
   * pass" regardless of lowerIsBetter's direction. null unless
   * trainingStatus === 'fail' (never shown for 'pass' — nothing to
   * report — or 'not_yet_tested' — no value to measure a gap from).
   */
  trainingGapFromThreshold: number | null;
}

export interface UnitDetailSoldierRow {
  soldierId: string;
  name: string;
  tests: UnitDetailSoldierTest[];
  statusLabel: string;
  /** The real, locked status (never 'partial' — that's display-only, folded into 'not_yet_tested' here) — what the filter chips filter by. */
  filterStatus: ReadinessCurrentStatus;
  /** 0 fail, 1 partial, 2 not_yet_tested, 3 pass, 4 exempt — David's locked sort order. */
  sortGroup: number;
  latestTestDate: string | null;
  /** 04.10.2026 (§13.85) — passed through verbatim from computeUnitRoster's own soldier.nearThreshold; nothing re-derived here. */
  nearThreshold: NearThresholdInfo;
}

export interface UnitDetailBody {
  unitId: string;
  unitName: string;
  /** Ancestors, root-first (brigade, then each intermediate unit) — does NOT include this unit itself. */
  breadcrumbChain: UnitDetailBreadcrumbSegment[];
  ownSoldierCount: number;
  childUnitCount: number;
  /** 04.10.2026 (§13.85) — this unit's OWN soldiers only, same scope as ownSoldierCount, read straight from DashboardUnitRow.nearThresholdCount (computeBrigadeDashboard, already resolved per-unit there). No cumulative variant — matches the locked "each level counts only its own" rule this whole screen already follows. */
  nearThresholdCount: number;
  lastUpdated: string | null;
  own: { overall: DashboardOverallBreakdown; components: DashboardComponentBreakdown[] };
  /** null when childUnitCount === 0 — the cumulative row never renders for a unit with no sub-units (nothing to accumulate). */
  cumulative: DashboardOverallBreakdown | null;
  /** Point B's mandatory, explicitly-marked cumulative line ("כולל הפלוגות: 40 חיילים · 28 כשירים (70%)") — pre-formatted server-side from `cumulative`, same number, just already in words. Null exactly when `cumulative` is null. */
  cumulativeNote: string | null;
  /** The mandatory "own-only" explanation sentence, level-correct Hebrew — null when childUnitCount === 0 (point A is moot with no sub-units to disclaim against). */
  childrenSectionNote: string | null;
  children: UnitDetailChildSummary[];
  soldiers: UnitDetailSoldierRow[];
}

export type UnitDetailResult =
  | { status: 200; body: UnitDetailBody }
  | { status: 400 | 403 | 503; body: { error: string } };

/** Mirrors reduceOverallStatus's own priority, applied to a SUBSET of a soldier's tests (the run or strength group) instead of all of them — same function, different input slice. */
function groupStatus(testIds: string[], statusByTestId: Map<string, ReadinessCurrentStatus>): ReadinessCurrentStatus {
  if (testIds.length === 0) return 'not_yet_tested';
  return reduceOverallStatus(testIds.map((id) => statusByTestId.get(id) ?? 'not_yet_tested'));
}

function deriveStatusLabelAndSort(
  currentStatus: ReadinessCurrentStatus | null,
  notPerformedReason: NotPerformedReason | null,
  statusByTestId: Map<string, ReadinessCurrentStatus>,
): { label: string; sortGroup: number; filterStatus: ReadinessCurrentStatus } {
  const runStatus = groupStatus([RUN_TEST_ID], statusByTestId);
  const strengthStatus = groupStatus(STRENGTH_TEST_IDS, statusByTestId);

  if (currentStatus === 'fail') {
    const parts: string[] = [];
    if (runStatus === 'fail') parts.push('ריצה');
    if (strengthStatus === 'fail') parts.push('כוח');
    return { label: `לא כשיר — ${parts.join(', ')}`, sortGroup: 0, filterStatus: 'fail' };
  }
  if (currentStatus === 'not_performed') {
    return {
      label: notPerformedReason ? NOT_PERFORMED_REASON_LABEL[notPerformedReason] : 'לא ביצע',
      sortGroup: 4,
      filterStatus: 'not_performed',
    };
  }
  if (currentStatus === 'pass') {
    return { label: 'כשיר', sortGroup: 3, filterStatus: 'pass' };
  }
  // not_yet_tested overall — distinguish fully-untested from partially-measured for DISPLAY only.
  const incompleteParts: string[] = [];
  if (runStatus === 'not_yet_tested') incompleteParts.push('ריצה');
  if (strengthStatus === 'not_yet_tested') incompleteParts.push('כוח');
  if (incompleteParts.length === 0 || incompleteParts.length === 2) {
    // 0 incomplete can't actually happen here (would mean overall==='pass'); 2 means truly nothing measured.
    return { label: 'טרם נבדק', sortGroup: 2, filterStatus: 'not_yet_tested' };
  }
  return { label: `חלקי — ${incompleteParts.join(', ')} טרם נמדד`, sortGroup: 1, filterStatus: 'not_yet_tested' };
}

export async function computeUnitDetail(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { unitId: string; tenantId?: string | null },
): Promise<UnitDetailResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }
  if (!query.unitId) {
    return { status: 400, body: { error: 'unitId is required' } };
  }

  const [dashboardResult, rosterResult] = await Promise.all([
    computeBrigadeDashboard(db, scope, { tenantId: query.tenantId ?? null, unitId: null }),
    computeUnitRoster(db, scope, { tenantId: query.tenantId ?? null, unitId: null }),
  ]);

  if (dashboardResult.status !== 200) return dashboardResult;
  if (rosterResult.status !== 200) return rosterResult;

  const { units, components, tenantId } = dashboardResult.body;
  const target = units.find((u) => u.unitId === query.unitId);
  if (!target) {
    // Not found, or found but outside this caller's scope — same
    // response either way, never distinguishing the two (no existence leak).
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  // Direct children — one level down only.
  const children = units.filter((u) => u.parentUnitId === target.unitId);

  // Full subtree (target + every descendant, transitively) for the cumulative sum.
  const unitsById = new Map(units.map((u) => [u.unitId, u]));
  const subtreeIds = new Set<string>([target.unitId]);
  let frontier = [target.unitId];
  while (frontier.length > 0) {
    const next = units.filter((u) => u.parentUnitId && frontier.includes(u.parentUnitId)).map((u) => u.unitId);
    for (const id of next) subtreeIds.add(id);
    frontier = next;
  }

  const own: DashboardOverallBreakdown = { ...target.views.all, totalCount: target.totalCount };

  let cumulative: DashboardOverallBreakdown | null = null;
  if (children.length > 0) {
    let totalCount = 0, passCount = 0, failCount = 0, notPerformedCount = 0, notYetTestedCount = 0;
    for (const id of Array.from(subtreeIds)) {
      const u = unitsById.get(id);
      if (!u) continue;
      totalCount += u.totalCount;
      passCount += u.views.all.passCount;
      failCount += u.views.all.failCount;
      notPerformedCount += u.views.all.notPerformedCount;
      notYetTestedCount += u.views.all.notYetTestedCount;
    }
    const testedCount = passCount + failCount;
    cumulative = { totalCount, passCount, failCount, notPerformedCount, notYetTestedCount, testedCount, passPercent: pct(passCount, testedCount) };
  }

  // 06.10.2026 (David, pattern fix) — explicit field-by-field construction,
  // never `...c` (the brigade-wide breakdown). A spread silently carries
  // through any field this unit-scoped object doesn't override — that's
  // exactly how the training fields almost shipped with brigade-wide
  // numbers instead of this unit's own. Listing every field by name turns
  // a future unguarded addition to DashboardComponentBreakdown into a tsc
  // error here (missing property), not a silently-wrong number.
  const ownComponents: DashboardComponentBreakdown[] = components.map((c) => {
    const cell = target.perComponent[c.testId];
    return {
      testId: c.testId,
      label: c.label,
      unit: c.unit,
      thresholdMale: c.thresholdMale,
      thresholdFemale: c.thresholdFemale,
      passCount: cell?.passCount ?? 0,
      failCount: cell?.failCount ?? 0,
      testedCount: cell?.testedCount ?? 0,
      passPercent: cell?.passPercent ?? null,
      trainingPassCount: cell?.trainingPassCount ?? 0,
      trainingFailCount: cell?.trainingFailCount ?? 0,
      trainingTestedCount: cell?.trainingTestedCount ?? 0,
      trainingPassPercent: cell?.trainingPassPercent ?? null,
    };
  });

  // Breadcrumb — walk parentUnitId up through the SAME flat `units`
  // array (no new query), then prepend the brigade itself, read
  // directly from unitDirectory — the one extra lightweight read this
  // whole file needs, since computeBrigadeDashboard's own response
  // doesn't carry the brigade's name anywhere (it never appears as a
  // row — the brigade is implicit, one call = one tenant = one brigade).
  const chain: UnitDetailBreadcrumbSegment[] = [];
  let walker: DashboardUnitRow | undefined = target;
  while (walker?.parentUnitId) {
    const parent = unitsById.get(walker.parentUnitId);
    if (!parent) break;
    chain.unshift({ unitId: parent.unitId, name: parent.unitName });
    walker = parent;
  }
  const brigadeDirSnap = await db.collection('unitDirectory').doc(tenantId).get();
  const brigadeName = brigadeDirSnap.exists && typeof brigadeDirSnap.data()?.name === 'string' ? brigadeDirSnap.data()!.name : tenantId;
  chain.unshift({ unitId: null, name: brigadeName });

  // --- Soldiers: this unit's OWN soldiers only, from the already-fetched roster ---
  const config200 = rosterResult.body;
  const ownSoldiers = config200.soldiers.filter((s) => s.unitId === target.unitId);

  // 06.10.2026 — training-derived (app workout data) value, same shared
  // module/functions the dashboard's own training columns use. Scoped
  // to just THIS unit's own linked soldiers (not the whole brigade) —
  // efficient, and this is the only place that needs the real
  // thresholds config object (readiness-dashboard.service.ts's own copy
  // isn't exposed in its return value, so one small extra read here,
  // same precedent as this file's own brigade-name read just above).
  const thresholdsSnap = await db.collection('readiness_thresholds').doc('global').get();
  const thresholdsConfig = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;
  const linkedUids = ownSoldiers.filter((s) => typeof s.uid === 'string').map((s) => s.uid as string);
  const [strengthLevelsByUid, runLevelsByUid] = thresholdsConfig && linkedUids.length > 0
    ? await Promise.all([
        computeDemonstratedStrengthLevels(db, linkedUids),
        computeDemonstratedRunLevels(db, linkedUids),
      ])
    : [{}, {}];

  const soldiers: UnitDetailSoldierRow[] = ownSoldiers.map((s) => {
    const statusByTestId = new Map(s.testDetails.map((t) => [t.testId, t.status]));
    const { label, sortGroup, filterStatus } = deriveStatusLabelAndSort(s.currentStatus, s.notPerformedReason, statusByTestId);

    const uid = typeof s.uid === 'string' ? s.uid : null;
    const strengthLevels = uid ? strengthLevelsByUid[uid] : undefined;
    const runLevel = uid ? runLevelsByUid[uid] : undefined;

    const tests: UnitDetailSoldierTest[] = s.testDetails.map((t) => {
      const def = components.find((c) => c.testId === t.testId);
      const defaultThreshold = def?.thresholdMale ?? null;

      // Training value/status — same unit (reps / normalized seconds)
      // as `value` below, directly comparable to `thresholdValue`.
      let trainingValue: number | null = null;
      let trainingStatus: ReadinessCurrentStatus = 'not_yet_tested';
      if (thresholdsConfig) {
        if (t.testId === RUN_TEST_ID) {
          trainingValue = runLevel?.normalizedTimeSeconds ?? null;
          trainingStatus = runMeetsStatus(trainingValue, thresholdsConfig, s.gender);
        } else if (t.testId === PULL_TEST_ID) {
          trainingValue = strengthLevels?.pull.reps ?? null;
          trainingStatus = strengthMeetsStatus('pull', strengthLevels?.pull.level ?? null, trainingValue, thresholdsConfig, s.gender);
        } else if (t.testId === PUSH_TEST_ID) {
          trainingValue = strengthLevels?.push.reps ?? null;
          trainingStatus = strengthMeetsStatus('push', strengthLevels?.push.level ?? null, trainingValue, thresholdsConfig, s.gender);
        }
        // any other test id — this module derives no training evidence for it; stays null/not_yet_tested, never guessed at.
      }
      const trainingTestDef = thresholdsConfig?.tests.find((td) => td.id === t.testId) ?? null;
      const trainingThreshold = trainingTestDef ? trainingTestDef.threshold[s.gender] : null;
      const trainingGapFromThreshold = trainingStatus === 'fail' && trainingValue !== null && trainingThreshold !== null && trainingTestDef
        ? Math.abs(trainingTestDef.lowerIsBetter ? trainingValue - trainingThreshold : trainingThreshold - trainingValue)
        : null;

      return {
        testId: t.testId,
        value: t.value,
        testDate: t.testDate,
        thresholdValue: t.thresholdValue,
        trainingValue,
        trainingStatus,
        trainingGapFromThreshold,
        isDefaultThreshold: defaultThreshold !== null && t.thresholdValue === defaultThreshold,
        status: t.status,
        isFailCause: t.status === 'fail',
      };
    });

    const realDates = s.testDetails.map((t) => t.testDate).filter((d): d is string => d !== null);
    const latestTestDate = realDates.length > 0 ? realDates.reduce((a, b) => (a > b ? a : b)) : null;

    return { soldierId: s.id, name: s.name, tests, statusLabel: label, filterStatus, sortGroup, latestTestDate, nearThreshold: s.nearThreshold };
  });

  soldiers.sort((a, b) => {
    if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
    const ad = a.latestTestDate, bd = b.latestTestDate;
    if (ad !== bd) {
      if (ad === null) return 1;
      if (bd === null) return -1;
      if (ad !== bd) return ad > bd ? -1 : 1; // descending
    }
    return a.name.localeCompare(b.name, 'he');
  });

  const childSummaries: UnitDetailChildSummary[] = children.map((c) => ({
    unitId: c.unitId,
    unitName: c.unitName,
    totalCount: c.totalCount,
    testedCount: c.views.all.testedCount,
    passPercent: c.views.all.passPercent,
  }));

  const childLevelPlural = children.length > 0 ? (LEVEL_PLURAL[children[0].level ?? 'company'] ?? LEVEL_PLURAL.company) : null;

  const childrenSectionNote = children.length > 0
    ? `המספרים למעלה סופרים את ${LEVEL_OWN_PHRASE[target.level ?? 'battalion'] ?? LEVEL_OWN_PHRASE.battalion} בלבד — לא את ${childLevelPlural}`
    : null;

  const cumulativeNote = cumulative
    ? `כולל ${childLevelPlural}: ${cumulative.totalCount} חיילים${cumulative.passPercent !== null ? ` · ${cumulative.passCount} כשירים (${cumulative.passPercent}%)` : ''}`
    : null;

  return {
    status: 200,
    body: {
      unitId: target.unitId,
      unitName: target.unitName,
      breadcrumbChain: chain,
      ownSoldierCount: target.totalCount,
      childUnitCount: children.length,
      nearThresholdCount: target.nearThresholdCount,
      lastUpdated: target.lastTestDate,
      own: { overall: own, components: ownComponents },
      cumulative,
      cumulativeNote,
      childrenSectionNote,
      children: childSummaries,
      soldiers,
    },
  };
}
