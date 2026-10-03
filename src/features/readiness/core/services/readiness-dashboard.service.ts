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
 *
 * 03.10.2026 (Stage 6, unit-hierarchy round) — DashboardUnitRow gains
 * `parentUnitId`/`breadcrumb`, resolved from the `unitDirectory`
 * collection (NOT from this unit's own, almost-always-absent
 * `parentUnitId` field — §13.76's investigation found only 2/137 real
 * units have that field populated). unitDirectory already links every
 * battalion to its brigade — NOT via a real parentUnitId chain, but via
 * a fallback: onUnitWrite.ts writes `parentId: parentUnitId ??
 * tenantId` for every unit, so a battalion with no explicit parent
 * falls back to its own tenantId, which IS its brigade's unitDirectory
 * doc id 1:1 (onAuthorityWrite.ts writes the brigade entry at
 * `unitDirectory/{authorityId}` directly) — verified live, 03.10.2026:
 * authorities/{id} exists for all 49/49 real military tenants, and all
 * 135/135 real battalions resolve their brigade through exactly this
 * fallback (0 via a real parentUnitId — only the 2 real companies in
 * the whole system use an actual parentUnitId chain). Read-only: this
 * file queries unitDirectory, never writes it, and firestore.rules
 * already makes it unconditionally public (`allow read: if true`) —
 * moot anyway since every read in this file goes through the Admin
 * SDK, which rules never gate.
 *
 * 03.10.2026 (table visual-continuation round) — per-unit `views` added:
 * the same per-soldier reduction already computed for the brigade-wide
 * 'overall' figure (reduceOverallStatus over ALL tests) is additionally
 * computed over two fixed subsets — 'run' (just run_3000m) and
 * 'strength' (pullups + dips, same all-must-pass rule, no averaging —
 * David's explicit definition, verbatim: "אותו כלל של כישלון אחד
 * מספיק... אל תמציא ממוצע"). No new Firestore reads — every soldier's
 * perTestStatus array was already computed in-memory for the existing
 * 'all' reduction; this just reduces it two more ways and accumulates
 * three parallel counters per unit instead of one. The two test ids are
 * hardcoded ('run_3000m' / 'pullups' + 'dips') because
 * ReadinessTestDefinition has no category/group field to key off of —
 * adding one would touch the protected readiness-write.service.ts and
 * require a data backfill, neither in scope this round. Flagged as a
 * known limitation: a future test that isn't run_3000m/pullups/dips
 * (e.g. a swim or agility test) silently falls into neither view's
 * accumulator today and would need this file revisited by name, not
 * picked up automatically.
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
  type ReadinessCurrentStatus,
} from './readiness-write.service';
import { reduceOverallStatus, toDate } from './readiness-read.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בלוח זה.';

const RUN_TEST_ID = 'run_3000m';
const STRENGTH_TEST_IDS = ['pullups', 'dips'];

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

/** Same shape as DashboardOverallBreakdown minus totalCount (the unit's totalCount is fixed and lives once on DashboardUnitRow, not duplicated per view). */
export interface DashboardUnitStatusBreakdown {
  passCount: number;
  failCount: number;
  notPerformedCount: number;
  notYetTestedCount: number;
  testedCount: number;
  passPercent: number | null;
}

export type DashboardUnitViewKey = 'all' | 'run' | 'strength';

export interface DashboardUnitRow {
  unitId: string;
  unitName: string;
  totalCount: number;
  /** One breakdown per filter view — 'all' (every test, all-must-pass), 'run' (run_3000m alone), 'strength' (pullups+dips, all-must-pass). The table's overall-readiness column, status bar, and sort must all read from the SAME active view — never mix views on screen at once. */
  views: Record<DashboardUnitViewKey, DashboardUnitStatusBreakdown>;
  perComponent: Record<string, { passCount: number; failCount: number; testedCount: number; passPercent: number | null }>;
  /** ISO, the most recent testDate among this unit's soldiers' organized_test results. null if none. */
  lastTestDate: string | null;
  /** The REAL unitId (within this same tenant's unit list) this unit nests under — null for a top-level unit (its parent, if any in unitDirectory, is the brigade itself, not another unit in this list). Resolved via unitDirectory, see file header. */
  parentUnitId: string | null;
  /** Ancestor names, nearest-first, joined with " · " (e.g. "גדוד 9307 · חטיבה 810") — null only if unitDirectory has no entry for this unit at all (sync hasn't caught up, or an edge case) — never fabricated. */
  breadcrumb: string | null;
  /** This unit's own unitDirectory level ('battalion'/'company'/'platoon') — null if unitDirectory has no entry for it. */
  level: string | null;
}

export type BrigadeDashboardResult =
  | {
      status: 200;
      body: {
        /** The resolved tenant this result is scoped to — added for computeUnitDetail (readiness-unit-detail.service.ts), which needs it to fetch the brigade's own unitDirectory entry without re-deriving scope-resolution logic a second time. */
        tenantId: string;
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

interface ViewAcc {
  passCount: number;
  failCount: number;
  notPerformedCount: number;
  notYetTestedCount: number;
}

function newViewAcc(): ViewAcc {
  return { passCount: 0, failCount: 0, notPerformedCount: 0, notYetTestedCount: 0 };
}

function bumpViewAcc(acc: ViewAcc, status: ReadinessCurrentStatus): void {
  if (status === 'pass') acc.passCount++;
  else if (status === 'fail') acc.failCount++;
  else if (status === 'not_performed') acc.notPerformedCount++;
  else acc.notYetTestedCount++;
}

function toUnitBreakdown(acc: ViewAcc): DashboardUnitStatusBreakdown {
  const testedCount = acc.passCount + acc.failCount;
  return { ...acc, testedCount, passPercent: pct(acc.passCount, testedCount) };
}

interface UnitDirectoryEntry {
  name: string;
  parentId: string | null;
  unitId: string | null;
  level: string | null;
}

/** Mirrors onUnitWrite.ts's own directoryIdForUnit() exactly — same composite-id convention, not a new one. */
function directoryIdForUnit(tenantId: string, unitId: string): string {
  return `${tenantId}__${unitId}`;
}

/**
 * This unit's parent, expressed as a REAL unitId within the same
 * tenant's unit list — null when the unit is top-level (its
 * unitDirectory parentId is either absent, or is the tenantId itself —
 * the brigade fallback described in the file header, meaning "no
 * parent unit in this list, only the brigade").
 */
function resolveParentUnitId(tenantId: string, unitId: string, dirByDirectoryId: Map<string, UnitDirectoryEntry>): string | null {
  const entry = dirByDirectoryId.get(directoryIdForUnit(tenantId, unitId));
  const parentDirectoryId = entry?.parentId ?? null;
  if (!parentDirectoryId || parentDirectoryId === tenantId) return null;
  return dirByDirectoryId.get(parentDirectoryId)?.unitId ?? null;
}

/** This unit's own unitDirectory level ('battalion'/'company'/'platoon') — null when unitDirectory has no entry for it. Used for level-correct Hebrew wording (e.g. "הגדוד עצמו... הפלוגות") on the unit-detail screen, see readiness-unit-detail.service.ts. */
function resolveLevel(tenantId: string, unitId: string, dirByDirectoryId: Map<string, UnitDirectoryEntry>): string | null {
  return dirByDirectoryId.get(directoryIdForUnit(tenantId, unitId))?.level ?? null;
}

/** Ancestor names, nearest-first — same walk shape as unit-league-selection.ts's buildBreadcrumb (arena domain), reimplemented here rather than imported (CLAUDE.md: no cross-domain imports). */
function buildBreadcrumb(tenantId: string, unitId: string, dirByDirectoryId: Map<string, UnitDirectoryEntry>): string | null {
  const names: string[] = [];
  let parentId = dirByDirectoryId.get(directoryIdForUnit(tenantId, unitId))?.parentId ?? null;
  let guard = 0;
  while (parentId && guard < 10) {
    const parent = dirByDirectoryId.get(parentId);
    if (!parent) break;
    names.push(parent.name);
    parentId = parent.parentId;
    guard++;
  }
  return names.length > 0 ? names.join(' · ') : null;
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

  const [soldiersSnap, resultsSnap, thresholdsSnap, unitDocs, unitDirectorySnap] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_results').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
    unitDocsPromise,
    db.collection('unitDirectory').where('orgId', '==', targetTenantId).get(),
  ]);

  const unitNameById = new Map<string, string>();
  for (const d of unitDocs) {
    unitNameById.set(d.id, typeof d.data()?.name === 'string' ? d.data()!.name : d.id);
  }

  // Read-only: resolves unit hierarchy (brigade<->battalion<->company)
  // from unitDirectory — see file header for why the real units'
  // own parentUnitId field can't be used directly (almost never
  // populated). Never written to here.
  const dirByDirectoryId = new Map<string, UnitDirectoryEntry>();
  for (const d of unitDirectorySnap.docs) {
    const data = d.data();
    dirByDirectoryId.set(d.id, {
      name: typeof data.name === 'string' ? data.name : d.id,
      parentId: typeof data.parentId === 'string' ? data.parentId : null,
      unitId: typeof data.unitId === 'string' ? data.unitId : null,
      level: typeof data.level === 'string' ? data.level : null,
    });
  }

  const config = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;
  const testIds = config?.tests.map((t) => t.id) ?? [];
  const runIdx = testIds.indexOf(RUN_TEST_ID);
  const strengthIdxs = STRENGTH_TEST_IDS.map((id) => testIds.indexOf(id)).filter((i) => i !== -1);

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
    perComponent: Record<string, { passCount: number; failCount: number }>;
    lastTestMs: number | null;
    views: { all: ViewAcc; run: ViewAcc; strength: ViewAcc };
  }
  const unitAcc = new Map<string, UnitAcc>();
  const ensureUnitAcc = (unitId: string): UnitAcc => {
    let acc = unitAcc.get(unitId);
    if (!acc) {
      acc = {
        totalCount: 0,
        perComponent: {},
        lastTestMs: null,
        views: { all: newViewAcc(), run: newViewAcc(), strength: newViewAcc() },
      };
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
    const runStatus = runIdx === -1 ? 'not_yet_tested' : perTestStatus[runIdx];
    const strengthStatus = strengthIdxs.length === 0 ? 'not_yet_tested' : reduceOverallStatus(strengthIdxs.map((i) => perTestStatus[i]));

    if (overall === 'pass') passCount++;
    else if (overall === 'fail') failCount++;
    else if (overall === 'not_performed') notPerformedCount++;
    else notYetTestedCount++;

    bumpViewAcc(unitRow.views.all, overall);
    bumpViewAcc(unitRow.views.run, runStatus);
    bumpViewAcc(unitRow.views.strength, strengthStatus);

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
    const perComponent: Record<string, { passCount: number; failCount: number; testedCount: number; passPercent: number | null }> = {};
    for (const testId of testIds) {
      const c = acc.perComponent[testId];
      const testedForComponent = c.passCount + c.failCount;
      perComponent[testId] = { passCount: c.passCount, failCount: c.failCount, testedCount: testedForComponent, passPercent: pct(c.passCount, testedForComponent) };
    }
    return {
      unitId,
      unitName: unitNameById.get(unitId) ?? unitId,
      totalCount: acc.totalCount,
      views: {
        all: toUnitBreakdown(acc.views.all),
        run: toUnitBreakdown(acc.views.run),
        strength: toUnitBreakdown(acc.views.strength),
      },
      perComponent,
      lastTestDate: acc.lastTestMs !== null ? new Date(acc.lastTestMs).toISOString() : null,
      parentUnitId: resolveParentUnitId(targetTenantId, unitId, dirByDirectoryId),
      breadcrumb: buildBreadcrumb(targetTenantId, unitId, dirByDirectoryId),
      level: resolveLevel(targetTenantId, unitId, dirByDirectoryId),
    };
  });
  units.sort((a, b) => a.unitName.localeCompare(b.unitName, 'he'));

  return { status: 200, body: { tenantId: targetTenantId, overall, components, units } };
}
