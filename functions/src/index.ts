/**
 * SPEC-03 Wave D.5 — project-wide cost cap.
 *
 * Every function in this file used to have NO maxInstances at all,
 * meaning each could scale to the Cloud Run/Functions platform default
 * (up to 1000 concurrent instances) with nothing but a GCP BILLING
 * ALERT as a backstop — and an alert only notifies after the spend
 * already happened, it doesn't stop it. setGlobalOptions() applies a
 * default cap to every v2 function below unless a specific one
 * overrides it — this MUST run before any function file is imported
 * (hence being the first statement in this file, before any `export {}
 * from` line — those trigger each module's onCall/onSchedule/
 * onDocumentWritten/etc. call at import time, which captures whatever
 * global default is in effect at that moment).
 *
 * 20 is a starting point, not a measured ceiling — there are no real
 * users yet, so there's no real traffic pattern to tune against. Revisit
 * per-function (via an options override, not by raising this default)
 * once the 4,000-user migration gives a real concurrency picture.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ maxInstances: 20 });

export { onGroupMemberWrite, deleteZombieGroups } from './onGroupMemberWrite';
export { validateAccessCode } from './validateAccessCode';
export { onFeedPostCreate, onWorkoutCreate, rollupLeaderboard } from './leaderboard';
// runDataMigration.ts — deleted entirely 06.10.2026 (David's approval). Had
// already been pulled from deploy 10.09.2026 for being a destructive,
// globally-unscoped (not caller-tenant-scoped) migration whose admin-check
// accepted core.isTenantOwner === true — a real, held, customer role. Its
// one-time Hebrew-ID migration already ran; confirmed zero callers anywhere
// in the repo (grep, not assumed) before deletion. If a similar migration is
// ever needed again, write a fresh one scoped to the problem at hand — this
// is not a reusable utility to resurrect as-is.
export { onUnitWrite } from './onUnitWrite';
export { onAuthorityWrite } from './onAuthorityWrite';
export { onOsmAmenityWrite } from './onOsmAmenityWrite';
export { onMilitaryDeclarationWritten } from './militaryReserveLeague';
export { unitLeagueRollup } from './unitLeagueRollup';
export { dailyActivityPublicSync } from './dailyActivityPublicSync';
export { userPublicSync } from './userPublicSync';
export { verifyUploadContentType } from './verifyUploadContentType';
export { awardWorkoutXP } from './awardWorkoutXP';
export { reverseWorkoutXP } from './reverseWorkoutXP';
export { ingestHealthSamples } from './ingestHealthSamples';
export { logAuditAction } from './auditLogger';
export { cleanupOldLogs } from './cleanupOldLogs';
export { cleanupEphemeralDocs } from './cleanupEphemeralDocs';
export { requestAccountDeletion, onUserDelete } from './onUserDelete';
export { purgeExpiredLegalHolds } from './legalHold';
export { sendPushFromQueue } from './sendPushFromQueue';
// ── Social Engagement Engine — Lifecycle Dispatchers ──────────────────────────
export { onboardingDropoffDispatcher } from './onboardingDropoffDispatcher';
// ── Chat Push Notifications ───────────────────────────────────────────────────
export { chatMessageNotification } from './chatMessageNotification';
// ── Push Notification Triggers (Social Engagement Engine — phase 2) ───────────
export { onLevelUp } from './onLevelUp';
export { onContributionApproved } from './onContributionApproved';
export { retentionScheduler } from './retentionScheduler';
export { trainingReminderScheduler } from './trainingReminderScheduler';
// Reminder-sweep (workout-reminders build, Part B) — flag-gated
// (app_config/feature_flags.enableReminderSweepPush, default false) — see
// reminderSweepScheduler.ts header. NOT deployed yet; exported here so
// it's ready to ship once deployed and verified against the emulator
// test (reminderSweepScheduler.emulator.test.ts). David flips the flag
// himself after deploy — nothing in this build does that automatically.
export { reminderSweepScheduler } from './reminderSweepScheduler';
// ── Push Notification Triggers (Social Engagement Engine — phase 3: social) ───
export { onGroupMemberJoin } from './onGroupMemberJoin';
export { onKudosCreated } from './onKudosCreated';
// ── Notification-Manager-driven Triggers (reads workoutMetadata/notifications) ─
export { stepGoalNudgeScheduler } from './stepGoalNudgeScheduler';
export { pushOutcomeSweeper } from './pushOutcomeSweeper';
// onPushOpened (04.10.2026, attribution-correctness fix) — activates the
// outcome window on OPEN instead of SEND. Needs its own `firebase deploy
// --only functions:onPushOpened` like any new function; nothing here makes
// it live by itself. Until deployed, push_sent.checkAfter stays null forever
// (same as today) and pushOutcomeSweeper simply never has anything to check
// — a safe, inert default, not a broken intermediate state.
export { onPushOpened } from './onPushOpened';
// ── Social-Activities Build Plan Phase 3 — nearby-activity push ───────────────
// Flag-gated (app_config/feature_flags.socialActivityNearbyPushEnabled,
// default false) — see onPlannedActivityCreated.ts header. NOT deployed yet;
// exported here so it's ready to ship once David re-authenticates the
// Firebase CLI (same blocker as logAuditAction).
export { onPlannedActivityCreated } from './onPlannedActivityCreated';
// ── Admin Simulator — real-selection dry-run preview (read-only, no sends) ────
// NOT deployed yet — exported here so it's ready to ship once David
// re-authenticates the Firebase CLI (same blocker as logAuditAction /
// onPlannedActivityCreated above). Verify locally via the Functions emulator
// (`firebase emulators:start --only functions,firestore`) before deploying.
export { previewNotificationContent } from './previewNotificationContent';
// ── Background discovery worker (city-mapping one-click panel button prep) ────
// Poller, not a trigger+queue — see geoDiscoveryWorker.ts's own header for why.
export { cityMappingDiscoveryPoller } from './geoDiscoveryWorker';
