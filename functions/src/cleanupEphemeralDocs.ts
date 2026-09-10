/**
 * cleanupEphemeralDocs — hourly retention sweeper for short-lived
 * realtime collections.
 *
 * Compliance basis
 * ────────────────
 * The privacy policy (PRIVACY_POLICY_HE §11 — מדיניות שמירת נתונים)
 * commits to:
 *   • `presence/{uid}` — deleted after 24 h of inactivity.
 *   • `active_workouts/{uid}` — deleted within 2 h of session end.
 *   • `planned_sessions/{id}` — deleted once `expiresAt` has passed
 *     (TTL is set to startTime + 2 h at creation; this sweep is the
 *     server-side guarantee because client-side cleanup is unreliable).
 *
 * These are best-effort cleared by the client (`clearPresence` /
 * `clearActiveWorkout`) when the user signs out / ends a workout, but
 * client cleanup is unreliable: an app crash, kill-from-tray, or lost
 * network at the moment of teardown leaves an orphaned doc that would
 * otherwise live forever (and continue to leak the user's last known
 * fuzzed location to the heatmap).
 *
 * This scheduled function is the server-side guarantee. It runs every
 * hour and prunes anything past the documented retention window.
 *
 * Implementation notes
 * ────────────────────
 *   • Sweeps each collection independently — failures in one do NOT
 *     block the other.
 *   • Uses paged BatchedWrites (max 400 per batch — safely under the
 *     500-write Firestore ceiling), looped until the result set is
 *     empty for that pass.
 *   • Tagged 'us-central1' to align with the rest of the function set;
 *     pinned in functions index for easy region migration in Phase 8.
 *   • Retention windows are configurable via env vars (mainly for
 *     emulator / smoke-testing) but default to the policy values:
 *       PRESENCE_RETENTION_HOURS         (default 24)
 *       ACTIVE_WORKOUT_RETENTION_HOURS   (default 2)
 *   • Idempotent: re-running the sweep is a no-op once everything is
 *     already inside the retention window.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const PRESENCE_RETENTION_HOURS = (() => {
  const raw = Number(process.env.PRESENCE_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
})();

const ACTIVE_WORKOUT_RETENTION_HOURS = (() => {
  const raw = Number(process.env.ACTIVE_WORKOUT_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
})();

// planned_sessions use an absolute `expiresAt` timestamp; we delete any doc
// whose expiry is in the past (cutoff = now = 0 additional hours of grace).
// Set PLANNED_SESSION_GRACE_HOURS > 0 in env to keep expired docs briefly.
const PLANNED_SESSION_GRACE_HOURS = (() => {
  const raw = Number(process.env.PLANNED_SESSION_GRACE_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
})();

const BATCH_SIZE = 400;
const MS_PER_HOUR = 60 * 60 * 1000;

function cutoffHoursAgo(hours: number, now = new Date()): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(now.getTime() - hours * MS_PER_HOUR);
}

/**
 * Sweep `collection` deleting every doc whose `tsField` is older than
 * `cutoff`. Returns the number of documents removed.
 *
 * Uses the same loop-until-empty pagination pattern as cleanupOldLogs
 * so we stay safely below the 500-write batch ceiling and do not hold
 * a single multi-megabyte transaction open.
 */
async function sweepCollection(
  collection: string,
  tsField: string,
  cutoff: admin.firestore.Timestamp,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snap = await db
      .collection(collection)
      .where(tsField, '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;

    if (snap.size < BATCH_SIZE) break;
  }
  return totalDeleted;
}

/**
 * Sweep type:'ephemeral' community_groups docs created by
 * /api/invite/run-session (src/app/api/invite/run-session/route.ts) once
 * they're no longer relevant. Added 08.09.2026 as item ג of the
 * workout-sharing decision — closes the tap on the 21+ docs already
 * found cluttering "my groups" UIs and the admin overview screen,
 * without touching the share mechanism itself (that migration is
 * deliberately deferred to after app-store launch — see parking-lot.md).
 *
 * Expiry signal: NOT the group doc's own createdAt/updatedAt — a run can
 * be scheduled arbitrarily far in the future, so age-since-creation would
 * delete a group before its scheduled run even happens. Instead uses
 * group_invitations.expiresAt, which route.ts already computes correctly
 * for both "now" (creation + 2h) and "later" (scheduledFor + 2h) cases.
 * A single group can have MULTIPLE invitations (a re-invite reuses the
 * same groupId with a fresh token/expiresAt) — a group is only swept once
 * EVERY invitation pointing at it has expired, not just the first found.
 *
 * This duplicates (does not call) community.service.ts's deleteGroup()
 * contract — three options were weighed 08.09.2026, in order:
 *   1. HTTP call to a shared API route — rejected: a secret to manage, a
 *      network hop that can fail mid-delete, and a data operation that
 *      shouldn't need two services to complete one write.
 *   2. Import a shared TypeScript module directly — tested empirically:
 *      functions/tsconfig.json's include can be widened to reach a
 *      sibling directory outside functions/, and it compiles, but
 *      TypeScript's rootDir inference then restructures ALL of
 *      functions/lib's output (index.js moves from lib/index.js to
 *      lib/functions/src/index.js), silently breaking package.json's
 *      main entry point for every deployed function, not just this one.
 *      A non-disruptive version exists (a real local npm package with
 *      TypeScript project references, built independently) but is new
 *      infrastructure, not a same-day change — logged in parking-lot.md
 *      as a future improvement, not built today.
 *   3. Accept two hand-written implementations, made safe with a
 *      contract-parity test instead of shared code — this is what's
 *      shipped: deleteGroupContractAdminSdk (below) is exported
 *      specifically so tests/group-delete-contract-parity.ts can run it
 *      against an identical synthetic fixture as community.service.ts's
 *      deleteGroup() and assert the two resulting states match exactly.
 *      Divergence between the two implementations now fails a test
 *      instead of silently drifting — logged as a conscious, tested
 *      debt in parking-lot.md, not an unenforced risk.
 *
 * Guarded by app_config/feature_flags.ephemeralGroupSweepDeleteEnabled
 * (David, 08.09.2026: first pass must be report-only). Default
 * false/absent — the same "logs and returns, does nothing until flipped"
 * pattern as every other flag-gated scheduler in this file
 * (stepGoalNudgeScheduler.ts's own master-flag convention). In
 * report-only mode every candidate is fully identified and logged
 * (groupId, name, member count, why it's a candidate) but NO write of
 * any kind happens — not even the real delete's read-side calls beyond
 * what's needed to log accurately.
 */
export type GroupDeleteOutcome =
  | { status: 'deleted'; groupId: string; members: number; chat: boolean; messages: number; attendance: number; memberStatuses: number; opCount: number }
  | { status: 'report-only'; groupId: string; members: number; chat: boolean; messages: number; attendance: number; memberStatuses: number; opCount: number; memberUids: string[] }
  | { status: 'refused-op-limit'; groupId: string; opCount: number }
  | { status: 'already-gone'; groupId: string };

/**
 * The Admin-SDK half of the delete contract — extracted as its own
 * exported function (not inlined in the sweep loop) specifically so a
 * contract-parity test can call it directly and compare its resulting
 * state against community.service.ts's client-SDK deleteGroup() on an
 * identical synthetic fixture (David, 08.09.2026: cross-package code
 * sharing between functions/ and src/ was tested and found to silently
 * restructure functions/lib's output layout — see the comment above —
 * so this stays a hand-mirrored implementation, made safe by the parity
 * test in tests/group-delete-contract-parity.ts instead of by shared
 * code). Assumes the caller has already decided this groupId should be
 * deleted (type/expiry checks happen in the sweep loop, not here) —
 * this function's only job is the deletion contract itself.
 *
 * dryRun=true performs every read and the op-count guard but no write —
 * used both by the sweep's report-only mode and by nothing else.
 */
export async function deleteGroupContractAdminSdk(
  db: admin.firestore.Firestore,
  groupId: string,
  opts: { dryRun: boolean },
): Promise<GroupDeleteOutcome> {
  const groupRef = db.doc(`community_groups/${groupId}`);
  const groupSnap = await groupRef.get();

  const membersSnap = await groupRef.collection('members').get();
  const memberUids = membersSnap.docs.map((d) => d.id);

  const chatId = `group_${groupId}`;
  const chatRef = db.doc(`chats/${chatId}`);
  const chatSnap = await chatRef.get();
  const messagesSnap = chatSnap.exists ? await chatRef.collection('messages').get() : null;

  const attendanceSnap = await groupRef.collection('attendance').get();
  const memberStatusesSnaps = await Promise.all(
    attendanceSnap.docs.map((a) => a.ref.collection('member_statuses').get()),
  );
  const memberStatusesCount = memberStatusesSnaps.reduce((sum, s) => sum + s.size, 0);

  if (!groupSnap.exists && membersSnap.empty && attendanceSnap.empty && !chatSnap.exists) {
    return { status: 'already-gone', groupId };
  }

  const opCount =
    1 +
    membersSnap.size +
    memberUids.length * 2 +
    (chatSnap.exists ? 1 : 0) +
    (messagesSnap?.size ?? 0) +
    attendanceSnap.size +
    memberStatusesCount;

  if (opCount > 500) {
    return { status: 'refused-op-limit', groupId, opCount };
  }

  if (opts.dryRun) {
    return {
      status: 'report-only', groupId, opCount, memberUids,
      members: memberUids.length, chat: chatSnap.exists,
      messages: messagesSnap?.size ?? 0, attendance: attendanceSnap.size, memberStatuses: memberStatusesCount,
    };
  }

  const batch = db.batch();
  batch.delete(groupRef);
  membersSnap.docs.forEach((d) => batch.delete(d.ref));
  for (const uid of memberUids) {
    batch.set(
      db.doc(`user_memberships/${uid}`),
      { groupIds: admin.firestore.FieldValue.arrayRemove(groupId), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    // update(), not set(merge:true) — verified 08.09.2026 that set()
    // treats a dotted key as a literal field name, not a nested path,
    // and silently no-ops on the real nested field.
    batch.update(db.doc(`users/${uid}`), {
      'social.groupIds': admin.firestore.FieldValue.arrayRemove(groupId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  if (messagesSnap) messagesSnap.docs.forEach((d) => batch.delete(d.ref));
  if (chatSnap.exists) batch.delete(chatRef);
  memberStatusesSnaps.forEach((s) => s.docs.forEach((d) => batch.delete(d.ref)));
  attendanceSnap.docs.forEach((d) => batch.delete(d.ref));

  await batch.commit();

  return {
    status: 'deleted', groupId, opCount,
    members: memberUids.length, chat: chatSnap.exists,
    messages: messagesSnap?.size ?? 0, attendance: attendanceSnap.size, memberStatuses: memberStatusesCount,
  };
}

async function sweepEphemeralRunGroups(now: admin.firestore.Timestamp): Promise<number> {
  const flagsSnap = await db.doc('app_config/feature_flags').get();
  const deleteEnabled = flagsSnap.data()?.ephemeralGroupSweepDeleteEnabled === true;

  const expiredInvitesSnap = await db
    .collection('group_invitations')
    .where('source', '==', 'run-invite')
    .where('expiresAt', '<', now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredInvitesSnap.empty) return 0;

  const candidateGroupIds = new Set<string>(
    expiredInvitesSnap.docs.map((d) => d.data().groupId).filter(Boolean),
  );

  let deleted = 0;
  for (const groupId of candidateGroupIds) {
    try {
      // Skip if ANY invitation for this group (expired or not, including
      // ones outside this page) is still valid — a re-invite extended it.
      const stillValidSnap = await db
        .collection('group_invitations')
        .where('groupId', '==', groupId)
        .where('expiresAt', '>=', now)
        .limit(1)
        .get();
      if (!stillValidSnap.empty) continue;

      const groupRef = db.doc(`community_groups/${groupId}`);
      const groupSnap = await groupRef.get();
      if (!groupSnap.exists) continue; // already gone

      // Explicit condition, not reliance on the query above (which only
      // filtered group_invitations, never read the group doc's own
      // type) — checked and logged every time, never silently skipped.
      if (groupSnap.data()?.type !== 'ephemeral') {
        logger.warn(
          `[cleanupEphemeralDocs] candidate ${groupId} ("${groupSnap.data()?.name}") ` +
          `has an expired run-invite but type is "${groupSnap.data()?.type}", not "ephemeral" — ` +
          `skipping, never touching a non-ephemeral group here.`,
        );
        continue;
      }

      const outcome = await deleteGroupContractAdminSdk(db, groupId, { dryRun: !deleteEnabled });

      if (outcome.status === 'refused-op-limit') {
        logger.error(
          `[cleanupEphemeralDocs] ephemeral group ${groupId} needs ${outcome.opCount} write ops — ` +
          `refusing to split into non-atomic batches, skipping (manual cleanup needed).`,
        );
        continue;
      }
      if (outcome.status === 'already-gone') continue;

      if (outcome.status === 'report-only') {
        logger.info(
          `[cleanupEphemeralDocs] REPORT-ONLY — would delete ${groupId} ("${groupSnap.data()?.name}"): ` +
          `members=${outcome.members} [${outcome.memberUids.join(',')}], chat=${outcome.chat}, ` +
          `messages=${outcome.messages}, attendance=${outcome.attendance}, ` +
          `memberStatuses=${outcome.memberStatuses}, opCount=${outcome.opCount}. ` +
          `Set app_config/feature_flags.ephemeralGroupSweepDeleteEnabled=true to actually delete.`,
        );
        deleted++; // counts as "identified" in report-only mode, for the summary log below
        continue;
      }

      // outcome.status === 'deleted'
      deleted++;
    } catch (err: any) {
      logger.error(`[cleanupEphemeralDocs] failed to sweep ephemeral group ${groupId}:`, err?.message, err?.stack);
      // Continue to the next candidate — one bad group must not block the rest.
    }
  }

  return deleted;
}

export const cleanupEphemeralDocs = onSchedule(
  {
    // Hourly at minute 7 — offset from common :00 bursts so we don't
    // contend with other scheduled jobs / external scrapers.
    schedule: '7 * * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    const presenceCutoff = cutoffHoursAgo(PRESENCE_RETENTION_HOURS);
    const activeWorkoutCutoff = cutoffHoursAgo(ACTIVE_WORKOUT_RETENTION_HOURS);
    const plannedSessionCutoff = cutoffHoursAgo(PLANNED_SESSION_GRACE_HOURS);

    logger.info(
      `[cleanupEphemeralDocs] Sweep start — ` +
        `presence<${presenceCutoff.toDate().toISOString()} (${PRESENCE_RETENTION_HOURS}h), ` +
        `active_workouts<${activeWorkoutCutoff.toDate().toISOString()} (${ACTIVE_WORKOUT_RETENTION_HOURS}h), ` +
        `planned_sessions expiresAt<${plannedSessionCutoff.toDate().toISOString()}`,
    );

    let presenceDeleted = 0;
    let activeWorkoutDeleted = 0;
    let plannedSessionDeleted = 0;

    // Run independently so a failure in one collection does not block
    // the other (e.g. transient index/contention errors on presence
    // should not leave stale active_workouts polluting the heatmap).
    try {
      presenceDeleted = await sweepCollection('presence', 'updatedAt', presenceCutoff);
    } catch (err: any) {
      logger.error('[cleanupEphemeralDocs] presence sweep failed:', err?.message, err?.stack);
    }

    try {
      activeWorkoutDeleted = await sweepCollection(
        'active_workouts',
        'lastUpdate',
        activeWorkoutCutoff,
      );
    } catch (err: any) {
      logger.error(
        '[cleanupEphemeralDocs] active_workouts sweep failed:',
        err?.message,
        err?.stack,
      );
    }

    try {
      plannedSessionDeleted = await sweepCollection(
        'planned_sessions',
        'expiresAt',
        plannedSessionCutoff,
      );
    } catch (err: any) {
      logger.error(
        '[cleanupEphemeralDocs] planned_sessions sweep failed:',
        err?.message,
        err?.stack,
      );
    }

    let ephemeralGroupsDeleted = 0;
    try {
      ephemeralGroupsDeleted = await sweepEphemeralRunGroups(admin.firestore.Timestamp.now());
    } catch (err: any) {
      logger.error(
        '[cleanupEphemeralDocs] ephemeral run-invite groups sweep failed:',
        err?.message,
        err?.stack,
      );
    }

    const flagsSnap = await db.doc('app_config/feature_flags').get();
    const ephemeralSweepMode = flagsSnap.data()?.ephemeralGroupSweepDeleteEnabled === true ? 'DELETE' : 'REPORT-ONLY';

    logger.info(
      `[cleanupEphemeralDocs] Sweep complete — presence=${presenceDeleted}, ` +
        `active_workouts=${activeWorkoutDeleted}, planned_sessions=${plannedSessionDeleted}, ` +
        `ephemeral_run_groups=${ephemeralGroupsDeleted} (mode=${ephemeralSweepMode})`,
    );
  },
);
