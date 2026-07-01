/**
 * Pillar 3 — Cloud Function: onGroupMemberWrite
 *
 * Triggered on any write to community_groups/{groupId}/members/{uid}.
 *
 * Two jobs:
 *  1. Keep memberCount on the parent group in sync.
 *  2. Activate group (isActive = true) when memberCount >= minimumMembers.
 *
 * Anti-ghost scheduled function (deleteZombieGroups) runs once per day
 * and deletes groups where isActive=false and createdAt < 24h ago.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

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

    const membersSnap = await db
      .collection(`community_groups/${groupId}/members`)
      .get();
    const count = membersSnap.size;

    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return;

    const group = groupSnap.data()!;
    const minimumMembers: number = group.minimumMembers ?? 1;

    const updates: Record<string, unknown> = {
      memberCount: count,
      currentParticipants: count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!group.isActive && count >= minimumMembers) {
      updates.isActive = true;
      logger.info(`[onGroupMemberWrite] Activating group ${groupId} (${count}/${minimumMembers} members)`);
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

    if (zombies.empty) {
      logger.info('[deleteZombieGroups] No zombie groups found.');
      return;
    }

    const batch = db.batch();
    zombies.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    logger.info(`[deleteZombieGroups] Deleted ${zombies.size} zombie groups.`);
  },
);
