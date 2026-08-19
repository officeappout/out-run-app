export { onGroupMemberWrite, deleteZombieGroups } from './onGroupMemberWrite';
export { validateAccessCode } from './validateAccessCode';
export { onFeedPostCreate, onWorkoutCreate, rollupLeaderboard } from './leaderboard';
export { runDataMigration } from './runDataMigration';
export { onUnitWrite } from './onUnitWrite';
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
export { retentionScheduler } from './retentionScheduler';
export { trainingReminderScheduler } from './trainingReminderScheduler';
// ── Push Notification Triggers (Social Engagement Engine — phase 3: social) ───
export { onGroupMemberJoin } from './onGroupMemberJoin';
export { onKudosCreated } from './onKudosCreated';
// ── Notification-Manager-driven Triggers (reads workoutMetadata/notifications) ─
export { stepGoalNudgeScheduler } from './stepGoalNudgeScheduler';
export { pushOutcomeSweeper } from './pushOutcomeSweeper';
// ── Social-Activities Build Plan Phase 3 — nearby-activity push ───────────────
// Flag-gated (app_config/feature_flags.socialActivityNearbyPushEnabled,
// default false) — see onPlannedActivityCreated.ts header. NOT deployed yet;
// exported here so it's ready to ship once David re-authenticates the
// Firebase CLI (same blocker as logAuditAction).
export { onPlannedActivityCreated } from './onPlannedActivityCreated';
