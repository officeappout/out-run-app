/**
 * Trends screen (05.10.2026, §13.90). Read-only, zero writes. The
 * organized test happens once a year; between tests the official grade
 * is frozen while the soldier keeps training. This file computes BOTH
 * series so the UI can show them together — it decides nothing about
 * "meets threshold" that doesn't already follow from the EXISTING
 * thresholds config, and never duplicates that config's own pass/fail
 * comparison.
 *
 * === The green line (official test status) ===
 * A step function over REAL test-date events, never interpolated — the
 * official status genuinely does not change between tests, so "holding"
 * the last value IS the correct value, not an approximation of one.
 * Reuses `statusAsOf` (readiness-app-activity.service.ts, unmodified,
 * same-domain import) — it already answers "what was this soldier's
 * collapsed status as of some date," exactly what a step point needs,
 * evaluated at the WHOLE SCOPE's own distinct test-date events (the
 * union of every soldier's active-result testDates), not per-soldier
 * dates — this screen aggregates across a unit, it never drills into
 * one soldier.
 *
 * === The blue line (app-derived) ===
 * Calls computeDemonstratedStrengthLevels / computeDemonstratedRunLevels
 * (both just extended with an optional `asOf`, specifically so THIS
 * file could ask "what would the derivation have shown as of the end
 * of month M" using the exact same logic, never a parallel historical
 * path) once per month boundary in the chart's range, for every LINKED
 * soldier in scope.
 *
 * === The third state — the one place this screen could lie ===
 * A soldier whose strength module result has a real level but
 * `reps === null` (a time-held exercise was the only evidence at that
 * level) is NOT a pass and NOT a fail — excluded from both the
 * numerator and denominator, exactly like a `level === null` soldier
 * (insufficient training evidence). Both cases fold into the SAME
 * aggregation primitive as a readiness-domain 'not_yet_tested' value,
 * which is why `reduceOverallStatus` (readiness-read.service.ts,
 * unmodified) is reusable here verbatim for combining pull+push (or
 * run+pull+push) into one "meets threshold" signal per soldier. Its
 * priority, unambiguously (David's 05.10.2026 correction confirmed
 * this is what the function's own first line already does —
 * `if (perTest.includes('fail')) return 'fail'`, checked before
 * anything else): (1) ANY confirmed fail wins, full stop, even over an
 * undeterminable component — a soldier who clearly failed the run is
 * counted as a fail, not excused into "not determinable" just because
 * their pull-up reps happen to be uncountable; (2) no fail, but ANY
 * component undeterminable → the whole thing is undeterminable; (3)
 * every component confirmed pass → pass.
 *
 * === The canonical pull/push levels — hardcoded, verified, guarded ===
 * David's own answer, verbatim: pull → 11 (full pull-up), push → 10
 * (full dip), derived from the production mapping already verified for
 * §13.88 ({pull,11} at exercise sPASfuHeE1eAFQgHrE5z, {push,10} at
 * wYsAsYROBOsZfwm0GcKX). Hardcoded here, NOT a heuristic like
 * "level >= 10" (which is already wrong today — pull level 10 is not a
 * full pull-up). Guarded the same way the strength module's own
 * allowlist is guarded: if no exercise with exactly {pull,11} or
 * {push,10} exists at call time, this throws explicitly rather than
 * silently returning "nobody meets threshold" for every soldier.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIT_SCOPE_UNKNOWN_MESSAGE,
  isMemberWithinScope,
  type UnitPermissionScope,
} from '@/lib/unitPermissionScope';
import {
  type ReadinessSoldier,
  type ReadinessResult,
  type ReadinessThresholdsConfig,
  type ReadinessCurrentStatus,
} from './readiness-write.service';
import { reduceOverallStatus, toDate } from './readiness-read.service';
import { statusAsOf } from './readiness-app-activity.service';
import { computeDemonstratedStrengthLevels, type BaseProgramSlug } from './readiness-strength-level.service';
import { computeDemonstratedRunLevels } from './readiness-run-level.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות במגמות אלה.';
const RUN_TEST_ID = 'run_3000m';
const PULL_TEST_ID = 'pullups';
const PUSH_TEST_ID = 'dips';

/** David's answer, verbatim — see file header for the production ids this was verified against. Never a heuristic. */
const MIN_QUALIFYING_LEVEL: Record<BaseProgramSlug, number> = { pull: 11, push: 10 };

/** Below this fraction of the scope with a determinable blue-line value, the point is never drawn — a line built from a handful of people would look like a claim about a whole unit. */
const MIN_DETERMINABLE_FRACTION = 0.3;

export type ComponentFilter = 'all' | 'run' | 'strength';
export type PopulationFilter = 'all' | 'passed_previous_round' | 'did_not_pass_previous_round';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The END of the same local calendar day — used ONLY as the comparison
 * instant fed into statusAsOf's own `testDate.getTime() <= asOf.getTime()`
 * check, never as the grouping/display key (that stays startOfDay).
 * `startOfDay` alone is unsafe for that comparison: a date-only ISO
 * string like "2026-01-01" parses as UTC midnight, while
 * `new Date(y,m,d)` constructs LOCAL midnight — on this host
 * (UTC+2/+3), LOCAL midnight is CHRONOLOGICALLY EARLIER than UTC
 * midnight for the "same" calendar day, so a result's own UTC-midnight
 * testDate would fail a `<= startOfDay` check for its OWN day, making
 * statusAsOf see zero candidates and silently return 'not_yet_tested'
 * instead of the real outcome — confirmed empirically on this machine
 * before this comment was written, not theorized. Evaluating at the
 * END of the local day (not the start) is safe regardless of which
 * side of the UTC/local gap a given testDate was actually stored on.
 */
function endOfDay(dayStartMs: number): Date {
  const d = new Date(dayStartMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

export interface GreenLinePoint {
  /** ISO date of this test-date event. */
  date: string;
  passPercent: number | null;
  passCount: number;
  failCount: number;
  /** passCount + failCount — never includes not_performed/not_yet_tested. */
  testedCount: number;
}

export interface BlueLinePoint {
  /** ISO date — the END of the month this point represents. */
  month: string;
  meetsPercent: number | null;
  meetsCount: number;
  /** Linked soldiers with a determinable (pass-or-fail) value for the active filter, as of this month. */
  determinableCount: number;
  linkedCount: number;
  totalCount: number;
}

export interface ComponentAveragePoint {
  date: string;
  average: number;
  testedCount: number;
}

export interface TrendsBody {
  green: GreenLinePoint[];
  blue: BlueLinePoint[];
  /** Pre-formatted, for the mandatory coverage line under the blue line — null exactly when `blue` is empty (no test-date history to anchor months to). */
  latestCoverageNote: string | null;
  /** "מתוך N שלא עברו ב-DD.MM — M עברו ב-DD.MM" — null when there is no test-date event at all yet. */
  title: string | null;
  /** David's 05.10.2026 correction — non-null whenever the counted numbers are cumulative across a sub-tree rather than one unit's own soldiers: always set when no unit is selected (brigade-wide), and set when a SPECIFIC selected unit has zero soldiers of its own and falls back to its descendants. Same wording convention as OverallReadinessCard's own cumulativeNote. */
  cumulativeNote: string | null;
  /** Non-null only when populationFilter isn't 'all' and there is no shared "previous round" test-date in scope to compare against — an explicit, honest empty state, never a silent 0. */
  populationFilterNote: string | null;
  componentAverages: {
    run_3000m: ComponentAveragePoint[];
    pullups: ComponentAveragePoint[];
    dips: ComponentAveragePoint[];
  };
  thresholds: { testId: string; label: string; unit: string; lowerIsBetter: boolean; male: number; female: number }[];
}

export type TrendsResult =
  | { status: 200; body: TrendsBody }
  | { status: 400 | 403 | 503; body: { error: string } };

/**
 * Confirms the two hardcoded canonical levels above still correspond to
 * a REAL exercise in the catalog — never silently assume they still
 * do. Same loud-failure discipline as the strength module's own
 * allowlist guard: an exercise re-seed that moves these levels must
 * surface as a thrown error, not as "nobody meets threshold" for every
 * soldier in every unit, forever.
 */
async function verifyCanonicalLevelsExist(db: Firestore, programIdBySlug: Map<BaseProgramSlug, string>): Promise<void> {
  for (const slug of Object.keys(MIN_QUALIFYING_LEVEL) as BaseProgramSlug[]) {
    const programId = programIdBySlug.get(slug);
    if (!programId) {
      throw new Error(`computeReadinessTrends: no program resolved for slug "${slug}" — cannot verify the canonical level.`);
    }
    const level = MIN_QUALIFYING_LEVEL[slug];
    const snap = await db.collection('exercises')
      .where('targetPrograms', 'array-contains', { programId, level })
      .limit(1)
      .get();
    if (snap.empty) {
      throw new Error(`computeReadinessTrends: no exercise found with {programId: "${programId}" (slug "${slug}"), level: ${level}} — the canonical-level assumption may be stale. Refusing to silently report "nobody meets threshold."`);
    }
  }
}

/** Resolve pull/push program ids by slug — same pattern as the strength module's own allowlist (duplicated here deliberately, not imported, since it's a trends-screen-specific guard, not a general strength-module concern). */
async function resolveProgramIdsBySlug(db: Firestore): Promise<Map<BaseProgramSlug, string>> {
  const snap = await db.collection('programs').where('slug', 'in', ['pull', 'push']).get();
  const map = new Map<BaseProgramSlug, string>();
  snap.docs.forEach((d) => {
    const slug = d.data().slug;
    if (slug === 'pull' || slug === 'push') map.set(slug, d.id);
  });
  return map;
}

/**
 * One soldier's "meets threshold" status for ONE component, as a
 * ReadinessCurrentStatus so it can be folded into reduceOverallStatus
 * alongside the others — 'not_yet_tested' doubles as "not
 * determinable" here (app-derived data has no 'not_performed' concept
 * of its own).
 */
function runMeetsStatus(normalizedTimeSeconds: number | null, config: ReadinessThresholdsConfig, gender: ReadinessSoldier['gender']): ReadinessCurrentStatus {
  if (normalizedTimeSeconds === null) return 'not_yet_tested';
  const test = config.tests.find((t) => t.id === RUN_TEST_ID);
  if (!test) return 'not_yet_tested';
  const threshold = test.threshold[gender];
  const pass = test.lowerIsBetter ? normalizedTimeSeconds <= threshold : normalizedTimeSeconds >= threshold;
  return pass ? 'pass' : 'fail';
}

function strengthMeetsStatus(
  slug: BaseProgramSlug,
  level: number | null,
  reps: number | null,
  config: ReadinessThresholdsConfig,
  gender: ReadinessSoldier['gender'],
): ReadinessCurrentStatus {
  if (level === null) return 'not_yet_tested'; // no training evidence — "didn't train" is not "doesn't meet"
  if (level < MIN_QUALIFYING_LEVEL[slug]) return 'fail'; // a real, confirmed level below the bar — a determined fail
  if (reps === null) return 'not_yet_tested'; // the one place this screen could lie — level qualifies but no rep count exists
  const testId = slug === 'pull' ? PULL_TEST_ID : PUSH_TEST_ID;
  const test = config.tests.find((t) => t.id === testId);
  if (!test) return 'not_yet_tested';
  const threshold = test.threshold[gender];
  const pass = test.lowerIsBetter ? reps <= threshold : reps >= threshold;
  return pass ? 'pass' : 'fail';
}

/**
 * David's correction, 05.10.2026 — a scope whose selected unit has no
 * soldiers of ITS OWN (everyone is actually under its sub-units) must
 * fall back to the cumulative subtree, with an explicit note — the
 * SAME wording/distinction as OverallReadinessCard's own
 * `cumulativeNote` on the brigade dashboard, not a new convention.
 * Never changes the counting rule itself (each level still counts
 * only what's really assigned to it or its descendants) — just
 * prevents an officer from opening a real unit and seeing a blank
 * screen with no explanation. Mirrors
 * readiness-dashboard.service.ts's own unitDirectory-based subtree
 * walk (same directory-id convention, same collection) — duplicated
 * here deliberately rather than imported, since that file exposes no
 * reusable descendant-resolution helper today.
 */
function directoryIdForUnit(tenantId: string, unitId: string): string {
  return `${tenantId}__${unitId}`;
}

async function resolveDescendantUnitIds(db: Firestore, tenantId: string, unitId: string): Promise<string[]> {
  const dirSnap = await db.collection('unitDirectory').where('orgId', '==', tenantId).get();
  const childrenByParentDirId = new Map<string, string[]>();
  dirSnap.docs.forEach((d) => {
    const data = d.data();
    const parentId = typeof data.parentId === 'string' ? data.parentId : null;
    const childUnitId = typeof data.unitId === 'string' ? data.unitId : null;
    if (!parentId || !childUnitId) return;
    const list = childrenByParentDirId.get(parentId) ?? [];
    list.push(childUnitId);
    childrenByParentDirId.set(parentId, list);
  });

  const descendants: string[] = [];
  let frontier = [directoryIdForUnit(tenantId, unitId)];
  let guard = 0;
  while (frontier.length > 0 && guard < 20) {
    const nextFrontier: string[] = [];
    for (const dirId of frontier) {
      for (const childUnitId of childrenByParentDirId.get(dirId) ?? []) {
        descendants.push(childUnitId);
        nextFrontier.push(directoryIdForUnit(tenantId, childUnitId));
      }
    }
    frontier = nextFrontier;
    guard++;
  }
  return descendants;
}

function componentStatusesForFilter(
  filter: ComponentFilter,
  run: ReadinessCurrentStatus,
  pull: ReadinessCurrentStatus,
  push: ReadinessCurrentStatus,
): ReadinessCurrentStatus[] {
  if (filter === 'run') return [run];
  if (filter === 'strength') return [pull, push];
  return [run, pull, push];
}

export async function computeReadinessTrends(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null; componentFilter?: ComponentFilter; populationFilter?: PopulationFilter },
): Promise<TrendsResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  let targetTenantId: string;
  let targetUnitIds: string[] | null;

  if (scope.kind === 'unitAdmin') {
    targetTenantId = scope.tenantId;
    targetUnitIds = query.unitId ? [query.unitId] : scope.unitIds;
  } else if (scope.kind === 'tenantOwner') {
    targetTenantId = scope.tenantId;
    targetUnitIds = query.unitId ? [query.unitId] : null;
  } else {
    if (!query.tenantId) {
      return { status: 400, body: { error: 'tenantId is required' } };
    }
    targetTenantId = query.tenantId;
    targetUnitIds = query.unitId ? [query.unitId] : null;
  }
  if (query.unitId && scope.kind === 'unitAdmin' && !scope.unitIds.includes(query.unitId)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const componentFilter = query.componentFilter ?? 'all';
  const populationFilter = query.populationFilter ?? 'all';

  const [soldiersSnap, resultsSnap, thresholdsSnap] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_results').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
  ]);

  if (!thresholdsSnap.exists) {
    return { status: 400, body: { error: 'לא הוגדר סף כשירות גלובלי.' } };
  }
  const config = thresholdsSnap.data() as ReadinessThresholdsConfig;
  const testIds = config.tests.map((t) => t.id);

  // David's correction, 05.10.2026 — a specific unit with zero soldiers
  // of its OWN (everyone is really under its sub-units) falls back to
  // the cumulative subtree instead of showing a blank screen. Only
  // triggers on an EXPLICIT unit selection — a unitAdmin's own default
  // multi-unit command span (no query.unitId at all) is a different
  // thing and never goes through this fallback.
  let cumulativeNote: string | null = null;
  if (query.unitId) {
    const ownCount = soldiersSnap.docs.filter((d) => {
      const data = d.data();
      return !data.mergedInto && data.unitId === query.unitId;
    }).length;
    if (ownCount === 0) {
      const descendantIds = await resolveDescendantUnitIds(db, targetTenantId, query.unitId);
      if (descendantIds.length > 0) {
        targetUnitIds = [query.unitId, ...descendantIds];
        cumulativeNote = 'מצטבר — ליחידה זו אין חיילים משלה; המספרים כוללים את כל היחידות שתחתיה.';
      }
      // If there are no descendants either, targetUnitIds stays [query.unitId] — a genuinely empty unit, not a cumulative case; the empty-state UI already handles zero soldiers honestly.
    }
  } else {
    // Brigade-wide (no unit selected) is ALWAYS cumulative — same reason, same wording as OverallReadinessCard's own unconditional cumulativeNote on the brigade dashboard.
    cumulativeNote = 'מצטבר — כולל את כל החיילים בגדודים ובפלוגות שבחטיבה.';
  }

  const inScope = (unitId: unknown): boolean => {
    if (targetUnitIds === null) return true;
    return typeof unitId === 'string' && targetUnitIds.includes(unitId);
  };

  const soldiers: (Omit<ReadinessSoldier, 'id'> & { id: string })[] = soldiersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadinessSoldier, 'id'>) }))
    .filter((s) => !s.mergedInto && inScope(s.unitId));

  // Point 9 / §13.87: never count a superseded result — a correction is never a point and never shifts an average.
  const resultsBySoldier = new Map<string, ReadinessResult[]>();
  const allTestDateDayKeys = new Set<number>();
  resultsSnap.docs.forEach((doc) => {
    const data = doc.data() as Omit<ReadinessResult, 'id'>;
    if (!inScope(data.unitId)) return;
    if (data.supersededByResultId) return;
    const normalized: ReadinessResult = { id: doc.id, ...data, recordedAt: toDate(data.recordedAt), testDate: toDate(data.testDate) };
    const list = resultsBySoldier.get(data.soldierId) ?? [];
    list.push(normalized);
    resultsBySoldier.set(data.soldierId, list);
    allTestDateDayKeys.add(startOfDay(normalized.testDate));
  });

  const testDateEvents = Array.from(allTestDateDayKeys).sort((a, b) => a - b).map((ms) => new Date(ms));

  // ── Population filter — evaluated at the single most-recent test-date event across the whole scope ──
  const mostRecentEventDate = testDateEvents.length > 0 ? testDateEvents[testDateEvents.length - 1] : null;
  const previousEventDate = testDateEvents.length > 1 ? testDateEvents[testDateEvents.length - 2] : null;

  // Explicit, honest empty state when the chosen population filter has
  // nothing to compare against — never a silent 0 pretending there's
  // simply nobody in that bucket.
  const populationFilterNote: string | null = populationFilter !== 'all' && !previousEventDate
    ? 'אין עדיין סבב קודם להשוואה — דרושים שני תאריכי בוחן בהיקף זה.'
    : null;

  const passesPopulationFilter = (soldierId: string): boolean => {
    if (populationFilter === 'all') return true;
    if (!previousEventDate) return false; // no "previous round" exists at all
    const results = resultsBySoldier.get(soldierId) ?? [];
    const previousStatus = statusAsOf(results, testIds, endOfDay(previousEventDate.getTime()));
    return populationFilter === 'passed_previous_round' ? previousStatus === 'pass' : previousStatus === 'fail';
  };

  const filteredSoldiers = soldiers.filter((s) => passesPopulationFilter(s.id));

  // ── Green line ──
  const componentTestIdsForFilter = (filter: ComponentFilter): string[] => {
    if (filter === 'run') return [RUN_TEST_ID];
    if (filter === 'strength') return [PULL_TEST_ID, PUSH_TEST_ID];
    return testIds;
  };
  const activeTestIds = componentTestIdsForFilter(componentFilter);

  const green: GreenLinePoint[] = testDateEvents.map((eventDate) => {
    let passCount = 0;
    let failCount = 0;
    for (const s of filteredSoldiers) {
      const results = resultsBySoldier.get(s.id) ?? [];
      const perTest = activeTestIds.map((testId) => statusAsOf(results, [testId], endOfDay(eventDate.getTime())));
      const overall = reduceOverallStatus(perTest);
      if (overall === 'pass') passCount++;
      else if (overall === 'fail') failCount++;
    }
    const testedCount = passCount + failCount;
    return {
      date: eventDate.toISOString(),
      passPercent: testedCount > 0 ? Math.round((passCount / testedCount) * 1000) / 10 : null,
      passCount,
      failCount,
      testedCount,
    };
  });

  // ── Title: "מתוך N שלא עברו ב-DD.MM — M עברו ב-DD.MM", from the most recent event ──
  let title: string | null = null;
  if (mostRecentEventDate) {
    const latestGreen = green[green.length - 1];
    const dateLabel = `${String(mostRecentEventDate.getDate()).padStart(2, '0')}.${String(mostRecentEventDate.getMonth() + 1).padStart(2, '0')}`;
    title = `מתוך ${latestGreen.failCount} שלא עברו ב-${dateLabel} — ${latestGreen.passCount} עברו ב-${dateLabel}`;
  }

  // ── Blue line — one point per month, from the earliest test-date event's month (or this month, if none) through the current month ──
  const linkedSoldiers = filteredSoldiers.filter((s) => !!s.uid);
  const linkedUids = linkedSoldiers.map((s) => s.uid as string);
  const genderByUid = new Map(linkedSoldiers.map((s) => [s.uid as string, s.gender]));

  const blue: BlueLinePoint[] = [];
  if (linkedUids.length > 0) {
    const programIdBySlug = await resolveProgramIdsBySlug(db);
    await verifyCanonicalLevelsExist(db, programIdBySlug);

    const now = new Date();
    const firstMonthAnchor = testDateEvents.length > 0 ? testDateEvents[0] : now;
    const months: { year: number; month: number }[] = [];
    let y = firstMonthAnchor.getFullYear();
    let m = firstMonthAnchor.getMonth();
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      months.push({ year: y, month: m });
      m++;
      if (m > 11) { m = 0; y++; }
    }

    for (const { year, month } of months) {
      const asOf = endOfMonth(year, month);
      const [strengthByUid, runByUid] = await Promise.all([
        computeDemonstratedStrengthLevels(db, linkedUids, asOf),
        computeDemonstratedRunLevels(db, linkedUids, asOf),
      ]);

      let determinableCount = 0;
      let meetsCount = 0;
      for (const uid of linkedUids) {
        const gender = genderByUid.get(uid)!;
        const runStatus = runMeetsStatus(runByUid[uid].normalizedTimeSeconds, config, gender);
        const pullStatus = strengthMeetsStatus('pull', strengthByUid[uid].pull.level, strengthByUid[uid].pull.reps, config, gender);
        const pushStatus = strengthMeetsStatus('push', strengthByUid[uid].push.level, strengthByUid[uid].push.reps, config, gender);
        const overall = reduceOverallStatus(componentStatusesForFilter(componentFilter, runStatus, pullStatus, pushStatus));
        if (overall === 'pass' || overall === 'fail') {
          determinableCount++;
          if (overall === 'pass') meetsCount++;
        }
      }

      const fraction = filteredSoldiers.length > 0 ? determinableCount / filteredSoldiers.length : 0;
      blue.push({
        month: endOfMonth(year, month).toISOString(),
        meetsPercent: fraction >= MIN_DETERMINABLE_FRACTION && determinableCount > 0 ? Math.round((meetsCount / determinableCount) * 1000) / 10 : null,
        meetsCount,
        determinableCount,
        linkedCount: linkedUids.length,
        totalCount: filteredSoldiers.length,
      });
    }
  }

  // David's correction, 05.10.2026 — "say how many there are and how
  // many are missing," never a percent-shaped claim built on top of
  // zero or near-zero evidence. Same counts as before (no computation
  // touched here), three honest phrasings depending on what the counts
  // actually support: zero determinable, some determinable but below
  // the draw-a-line floor, or enough to state plainly.
  const latest = blue[blue.length - 1] ?? null;
  let latestCoverageNote: string | null = null;
  if (latest) {
    if (latest.determinableCount === 0) {
      latestCoverageNote = `אין עדיין נתוני אימון להצגה — מתוך ${latest.totalCount} חיילים, ${latest.linkedCount} מחוברים לחשבון באפליקציה, ואף אחד לא צבר מספיק אימונים בחודש האחרון.`;
    } else if (latest.meetsPercent === null) {
      latestCoverageNote = `אין עדיין מספיק נתון להצגת מגמה — מתוך ${latest.totalCount} חיילים, ${latest.linkedCount} מחוברים לחשבון באפליקציה, ו-${latest.determinableCount} מהם צברו מספיק אימונים בחודש האחרון.`;
    } else {
      latestCoverageNote = `מבוסס על ${latest.determinableCount} מתוך ${latest.totalCount} חיילים — ${latest.linkedCount} מקושרים, ${latest.determinableCount} עם נתון שניתן לקביעה.`;
    }
  }

  // ── Component averages — only from soldiers tested ON that exact date, for THIS specific test, non-superseded ──
  function buildComponentAverage(testId: string): ComponentAveragePoint[] {
    const byDateKey = new Map<number, number[]>();
    for (const s of filteredSoldiers) {
      const results = resultsBySoldier.get(s.id) ?? [];
      for (const r of results) {
        if (r.testId !== testId || r.value === null) continue;
        const key = startOfDay(r.testDate);
        const list = byDateKey.get(key) ?? [];
        list.push(r.value);
        byDateKey.set(key, list);
      }
    }
    return Array.from(byDateKey.entries())
      .sort(([a], [b]) => a - b)
      .map(([ms, values]) => ({
        date: new Date(ms).toISOString(),
        average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
        testedCount: values.length,
      }));
  }

  const thresholds = config.tests
    .filter((t) => [RUN_TEST_ID, PULL_TEST_ID, PUSH_TEST_ID].includes(t.id))
    .map((t) => ({ testId: t.id, label: t.label, unit: t.unit, lowerIsBetter: t.lowerIsBetter, male: t.threshold.male, female: t.threshold.female }));

  return {
    status: 200,
    body: {
      green,
      blue,
      latestCoverageNote,
      title,
      cumulativeNote,
      populationFilterNote,
      componentAverages: {
        run_3000m: buildComponentAverage(RUN_TEST_ID),
        pullups: buildComponentAverage(PULL_TEST_ID),
        dips: buildComponentAverage(PUSH_TEST_ID),
      },
      thresholds,
    },
  };
}
