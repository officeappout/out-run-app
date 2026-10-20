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
export { onWorkoutCreateLeagueStats } from './leagueScopeStats';
export { onReferralCreateLeagueBonus } from './referralBonus';
export { leagueStepsRollup } from './leagueStepsRollup';
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
// Unified Kelly (flag kelly_unified_v1): push for team / system messages in ai_coach_threads. New function: needs its own deploy.
export { onKellyThreadMessage } from './onKellyThreadMessage';
// ── Push Notification Triggers (Social Engagement Engine — phase 2) ───────────
export { onLevelUp } from './onLevelUp';
export { onContributionApproved } from './onContributionApproved';
export { retentionScheduler } from './retentionScheduler';
export { trainingReminderScheduler } from './trainingReminderScheduler';
// Motzei-Shabbat "שבוע טוב" nudge — Shabbat observers only (settings.shabbatObserver). New function: needs its own deploy.
export { weekStartScheduler } from './weekStartScheduler';
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
// Daily review of the קלי AI chat (drives /api/admin/ai-coach/reviews/run). Needs the
// AI_REVIEW_CRON_SECRET secret before deploy — see aiCoachReviewScheduler.ts.
export { aiCoachReviewScheduler } from './aiCoachReviewScheduler';
// Daily refresh of the admin "עלויות" dashboard (drives /api/admin/costs/refresh, same cron
// secret as above) — see adminCostsScheduler.ts.
export { adminCostsScheduler } from './adminCostsScheduler';
// Kelly phase 3 (19.10.2026): proactive messages (every 15 min) + nightly memory. Both
// flag-gated in the Next.js routes they drive (ai_coach_proactive / ai_coach_memory, default
// off); both use the AI_REVIEW_CRON_SECRET secret already set for aiCoachReviewScheduler.
export { kellyProactiveScheduler } from './kellyProactiveScheduler';
export { kellyMemoryScheduler } from './kellyMemoryScheduler';
// Generation review (19.10.2026): nightly invariant review of generated workouts / routes
// (drives /api/admin/generation-review/run; same AI_REVIEW_CRON_SECRET secret).
export { generationReviewScheduler } from './generationReviewScheduler';
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
// ── Soft-adaptation Phase 0 (18.10.2026) — anonymous per-exercise counters ───
// for the admin "תרגילים שמחליפים הכי הרבה" page. NOT deployed yet — see the
// PR's deploy steps (functions:onExerciseSwapCreated,onWorkoutCreateExerciseStats).
export { onExerciseSwapCreated, onWorkoutCreateExerciseStats } from './exerciseStats';
// ── AI testers (20.10.2026, owner-approved — agent-briefs/ai-testers-design.md B2) ──
// Custom tokens ONLY for demo_qa_* testers, only for the qa-runner service account (IAM
// invoker + OIDC check), only while enable_demo_users && enable_ai_testers. NOT deployed by
// the PR — see scripts/qa/README.md (deploy: functions:mintDemoTesterToken).
export { mintDemoTesterToken } from './mintDemoTesterToken';
// AI tester runner's only door to Firestore / Storage (least privilege — the qa-runner SA has no
// Firestore or Storage role). Same identity gate as mintDemoTesterToken. NOT deployed by the PR.
export { qaRunnerReport } from './qaRunnerReport';
// ── Demo world, layer A "life" (20.10.2026) — flag-gated (system_config/feature_flags.enable_demo_users,
// default off; text moments also need demo_life_llm). New function: needs its own deploy, and the
// ANTHROPIC_DEMO_KEY secret must exist first — see demoSimulatorTick.ts.
export { demoSimulatorTick } from './demoSimulatorTick';
