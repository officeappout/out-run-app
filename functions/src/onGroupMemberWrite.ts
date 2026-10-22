/**
 * Pillar 3 — Cloud Function: onGroupMemberWrite
 *
 * Triggered on any write to community_groups/{groupId}/members/{uid}.
 *
 * Two jobs:
 *  1. Keep memberCount on the parent group in sync.
 *  2. Activate a PENDING group (never activated, minimumMembers > 1) when
 *     memberCount >= minimumMembers — never a group an admin deactivated or
 *     moderation removed (lib/group-lifecycle.ts, group audit P1-5).
 *
 * Anti-ghost scheduled function (deleteZombieGroups) runs once per day and
 * deletes PENDING groups created more than 24 h ago — deactivated groups are
 * kept (they used to be hard-deleted).
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { isZombieGroup, shouldAutoActivate } from './lib/group-lifecycle';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── onGroupMemberWrite ───────────────────────────────────────────────────────

export const onGroupMemberWrite = onDocumentWritten(
  'community_groups/{groupId}/members/{uid}',
  async (event) => {
    const { groupId } = event.params;
    const groupRef = db.doc(`community_groups/${groupId}`);

    // Aggregation count (19.10.2026): was a full read of every member doc on
    // every member write (N reads per join). count() is billed as one read
    // per 1,000 docs and returns the same number the old .size did.
    const countSnap = await db
      .collection(`community_groups/${groupId}/members`)
      .count()
      .get();
    const count = countSnap.data().count;

    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return;

    const group = groupSnap.data()!;

    const updates: Record<string, unknown> = {
      memberCount: count,
      currentParticipants: count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (shouldAutoActivate(group, count)) {
      updates.isActive = true;
      updates.activatedAt = admin.firestore.FieldValue.serverTimestamp();
      logger.info(`[onGroupMemberWrite] Activating group ${groupId} (${count}/${group.minimumMembers} members)`);
    }

    await groupRef.update(updates);
  },
);

// ─── deleteZombieGroups ───────────────────────────────────────────────────────

/**
 * Runs every day at 03:00 UTC.
 * Deletes community groups that are still inactive 24 hours after creation.
 * This prevents orphaned "ghost" groups from cluttering the DB.
 */
export const deleteZombieGroups = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC' },
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const zombies = await db
      .collection('community_groups')
      .where('isActive', '==', false)
      .where('createdAt', '<', cutoff)
      .get();

    // Only PENDING groups (never activated) — an admin-deactivated or
    // moderation-removed group is inactive too, and must survive.
    const doomed = zombies.docs.filter((doc) => isZombieGroup(doc.data()));
    if (!doomed.length) {
      logger.info(`[deleteZombieGroups] No zombie groups found (${zombies.size} inactive kept).`);
      return;
    }

    const batch = db.batch();
    doomed.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    logger.info(`[deleteZombieGroups] Deleted ${doomed.length} zombie groups (${zombies.size - doomed.length} deactivated kept).`);
  },
);
