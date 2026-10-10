/**
 * Training-derived weekly shift — read-only, 07.10.2026. The brigade-
 * dashboard strip from the original four-location investigation
 * (06.10.2026): "קרובים לסף" / "הפכו לכשירים השבוע" / "ירדו מהקו",
 * now built. Source is EXCLUSIVELY readiness-training-status.service.ts
 * (runMeetsStatus/strengthMeetsStatus) plus computeDemonstratedStrengthLevels/
 * computeDemonstratedRunLevels — the SAME functions readiness-trends.service.ts's
 * blue line and readiness-dashboard.service.ts's per-brigade trainingOverall
 * already use. Nothing here is recomputed from scratch.
 *
 * === Naming — deliberately distinct from the OFFICIAL-test cards ===
 * NearThresholdCard ("קרובים לסף") and FailToPassTransitionCard ("עברו
 * מלא-כשיר לכשיר") already exist and are OFFICIAL-TEST-based (organized_test
 * results, not app workout data) — confirmed via computeNearThreshold/
 * computeFailToPassCount. This file's bucket names and the UI strip's own
 * labels (readiness-command's TrainingWeeklyShiftStrip, NOT built as part
 * of this file) must never read as the same claim. See the build report
 * for the exact proposed wording — flagged for David's confirmation, not
 * silently decided.
 *
 * === The two-point comparison ===
 * Default (no query.priorAsOf/nowAsOf given): today's training-derived
 * overall status vs the SAME derivation re-run 7 days ago — both
 * computeDemonstratedStrengthLevels/computeDemonstratedRunLevels already
 * accept an `asOf` parameter (readiness-trends.service.ts's blue line
 * already re-runs them once per historical month on the exact same
 * precedent). Both calls run once each for the WHOLE linked-uid list
 * (never per-soldier in a loop), in parallel with their "now" counterparts.
 *
 * 07.10.2026 (David, range-picker round) — query.priorAsOf/nowAsOf let
 * the caller pick ANY two points (week/month presets resolved
 * client-side, or a free custom pair), not just "today vs 7 days ago."
 * Gated by MIN_GAP_DAYS below: each point is itself derived from a
 * 30-day lookback window (computeDemonstratedStrengthLevels/RunLevels'
 * own default window), so two asOf points closer together than that
 * have near-totally-overlapping windows — any delta between them is a
 * technical artifact of the overlap, not a real training change.
 * Rejected outright (400), never silently shown with a caveat.
 *
 * A soldier only lands in one of the four buckets when BOTH their prior
 * (7-days-ago) AND current overall status are determinable (pass or
 * fail — never 'not_yet_tested' on either side). A soldier who only
 * became measurable THIS week (prior === 'not_yet_tested') is excluded
 * entirely, not counted as "became fit" — same "two real data points
 * required" rule computeFailToPassCount (readiness-app-activity.service.ts)
 * already follows for the official-test transition count.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { resolveReadinessTargetScope, UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';
import type { ReadinessSoldier, ReadinessThresholdsConfig, ReadinessCurrentStatus } from './readiness-write.service';
import { computeDemonstratedStrengthLevels, type BaseProgramSlug } from './readiness-strength-level.service';
import { computeDemonstratedRunLevels } from './readiness-run-level.service';
import { RUN_TEST_ID, PULL_TEST_ID, PUSH_TEST_ID, MIN_QUALIFYING_LEVEL, runMeetsStatus, strengthMeetsStatus } from './readiness-training-status.service';
import { computeNearThreshold, type FailedComponentInput } from './readiness-near-threshold';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בנתון זה.';
const SHIFT_WINDOW_DAYS = 7;
const MIN_GAP_DAYS = 7;
const RANGE_TOO_SHORT_MESSAGE = 'טווח קצר מ-7 ימים לא מאפשר להשוות — נתוני האימון מבוססים על 30 הימים שקדמו לכל נקודה.';

export interface TrainingWeeklyShiftBody {
  becameFitCount: number;
  nearThresholdCount: number;
  stayedFitCount: number;
  droppedCount: number;
  /**
   * How many linked soldiers had a determinable (pass-or-fail) training
   * status at BOTH asOf points — the denominator for all four counts
   * above. 0 exactly when there's no real training evidence yet at
   * either point in time — the UI must render "אין נתוני אימון עדיין"
   * (or a dash), never a fabricated "0" across all four numbers. A real
   * 0 in one specific bucket (e.g. zero became fit this week, while
   * determinableCount > 0) is still a real, meaningful zero.
   */
  determinableCount: number;
}

export type TrainingWeeklyShiftResult =
  | { status: 200; body: TrainingWeeklyShiftBody }
  | { status: 400 | 403 | 503; body: { error: string } };

function overallTrainingStatus(
  uid: string,
  gender: ReadinessSoldier['gender'],
  config: ReadinessThresholdsConfig,
  strengthByUid: Record<string, { pull: { level: number | null; reps: number | null }; push: { level: number | null; reps: number | null } }>,
  runByUid: Record<string, { normalizedTimeSeconds: number | null }>,
): ReadinessCurrentStatus {
  const runStatus = runMeetsStatus(runByUid[uid]?.normalizedTimeSeconds ?? null, config, gender);
  const pullStatus = strengthMeetsStatus('pull', strengthByUid[uid]?.pull.level ?? null, strengthByUid[uid]?.pull.reps ?? null, config, gender);
  const pushStatus = strengthMeetsStatus('push', strengthByUid[uid]?.push.level ?? null, strengthByUid[uid]?.push.reps ?? null, config, gender);
  const perTest: ReadinessCurrentStatus[] = [runStatus, pullStatus, pushStatus];
  if (perTest.includes('fail')) return 'fail';
  if (perTest.every((s) => s === 'pass')) return 'pass';
  return 'not_yet_tested';
}

export async function computeTrainingWeeklyShift(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null; priorAsOf?: Date; nowAsOf?: Date },
): Promise<TrainingWeeklyShiftResult> {
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

  const [soldiersSnap, thresholdsSnap] = await Promise.all([
    db.collection('readiness_soldiers').where('tenantId', '==', targetTenantId).get(),
    db.collection('readiness_thresholds').doc('global').get(),
  ]);
  const config = thresholdsSnap.exists ? (thresholdsSnap.data() as ReadinessThresholdsConfig) : null;

  const linked = soldiersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadinessSoldier, 'id'>) }))
    .filter((s) => !s.mergedInto && inScope(s.unitId) && typeof s.uid === 'string');

  const empty: TrainingWeeklyShiftBody = { becameFitCount: 0, nearThresholdCount: 0, stayedFitCount: 0, droppedCount: 0, determinableCount: 0 };
  if (!config || linked.length === 0) {
    return { status: 200, body: empty };
  }

  const uids = linked.map((s) => s.uid as string);
  const genderByUid = new Map(linked.map((s) => [s.uid as string, s.gender]));
  const nowAsOf = query.nowAsOf ?? new Date();
  const priorAsOf = query.priorAsOf ?? new Date(nowAsOf.getTime() - SHIFT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (nowAsOf.getTime() - priorAsOf.getTime() < MIN_GAP_DAYS * 24 * 60 * 60 * 1000) {
    return { status: 400, body: { error: RANGE_TOO_SHORT_MESSAGE } };
  }

  const [strengthNow, runNow, strengthPrior, runPrior] = await Promise.all([
    computeDemonstratedStrengthLevels(db, uids, nowAsOf),
    computeDemonstratedRunLevels(db, uids, nowAsOf),
    computeDemonstratedStrengthLevels(db, uids, priorAsOf),
    computeDemonstratedRunLevels(db, uids, priorAsOf),
  ]);

  const body: TrainingWeeklyShiftBody = { ...empty };

  for (const uid of uids) {
    const gender = genderByUid.get(uid) as ReadinessSoldier['gender'];
    const nowStatus = overallTrainingStatus(uid, gender, config, strengthNow, runNow);
    const priorStatus = overallTrainingStatus(uid, gender, config, strengthPrior, runPrior);
    if (nowStatus === 'not_yet_tested' || priorStatus === 'not_yet_tested') continue;

    body.determinableCount++;
    if (priorStatus === 'fail' && nowStatus === 'pass') {
      body.becameFitCount++;
    } else if (priorStatus === 'pass' && nowStatus === 'pass') {
      body.stayedFitCount++;
    } else if (priorStatus === 'pass' && nowStatus === 'fail') {
      body.droppedCount++;
    } else {
      // Still failing both times — near-threshold check reuses
      // computeNearThreshold verbatim (readiness-near-threshold.ts),
      // fed TODAY's training-derived value/threshold instead of an
      // official-test one. A component whose failure is a LEVEL gap
      // (level < MIN_QUALIFYING_LEVEL) has no reps-distance to be
      // "close" on — excluded, same as the official path never having
      // a level concept at all.
      const failed: FailedComponentInput[] = [];
      const runTest = config.tests.find((t) => t.id === RUN_TEST_ID);
      const normalizedTime = runNow[uid]?.normalizedTimeSeconds ?? null;
      if (runTest && normalizedTime !== null && runMeetsStatus(normalizedTime, config, gender) === 'fail') {
        failed.push({ testId: RUN_TEST_ID, label: runTest.label, unit: runTest.unit, value: normalizedTime, thresholdValue: runTest.threshold[gender], lowerIsBetter: runTest.lowerIsBetter });
      }
      for (const [slug, testId] of [['pull', PULL_TEST_ID], ['push', PUSH_TEST_ID]] as [BaseProgramSlug, string][]) {
        const level = strengthNow[uid]?.[slug].level ?? null;
        const reps = strengthNow[uid]?.[slug].reps ?? null;
        if (level === null || level < MIN_QUALIFYING_LEVEL[slug] || reps === null) continue;
        const test = config.tests.find((t) => t.id === testId);
        if (test && strengthMeetsStatus(slug, level, reps, config, gender) === 'fail') {
          failed.push({ testId, label: test.label, unit: test.unit, value: reps, thresholdValue: test.threshold[gender], lowerIsBetter: test.lowerIsBetter });
        }
      }
      if (computeNearThreshold(failed).isNear) body.nearThresholdCount++;
    }
  }

  return { status: 200, body };
}
