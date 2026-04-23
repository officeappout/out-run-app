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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── onGroupMemberWrite ───────────────────────────────────────────────────────

export const onGroupMemberWrite = functions.firestore
  .document('community_groups/{groupId}/members/{uid}')
  .onWrite(async (_change, context) => {
    const { groupId } = context.params;
    const groupRef = db.doc(`community_groups/${groupId}`);

    const membersSnap = await db
      .collection(`community_groups/${groupId}/members`)
      .get();
    const count = membersSnap.size;

    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return null;

    const group = groupSnap.data()!;
    const minimumMembers: number = group.minimumMembers ?? 1;

    const updates: Record<string, unknown> = {
      memberCount: count,
      currentParticipants: count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!group.isActive && count >= minimumMembers) {
      updates.isActive = true;
      console.log(`[onGroupMemberWrite] Activating group ${groupId} (${count}/${minimumMembers} members)`);
    }

    return groupRef.update(updates);
  });

// ─── deleteZombieGroups ───────────────────────────────────────────────────────

/**
 * Runs every day at 03:00 UTC.
 * Deletes community groups that are still inactive 24 hours after creation.
 * This prevents orphaned "ghost" groups from cluttering the DB.
 */
export const deleteZombieGroups = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const zombies = await db
      .collection('community_groups')
      .where('isActive', '==', false)
      .where('createdAt', '<', cutoff)
      .get();

    if (zombies.empty) {
      console.log('[deleteZombieGroups] No zombie groups found.');
      return null;
    }

    const batch = db.batch();
    zombies.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[deleteZombieGroups] Deleted ${zombies.size} zombie groups.`);
    return null;
  });
