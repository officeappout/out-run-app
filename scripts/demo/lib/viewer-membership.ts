/**
 * The ONLY place the demo scripts touch a real account's social.groupIds: a registered
 * viewer joining / leaving the demo groups. Mirrors joinEngine (src/lib/joinEngine.ts):
 * the member doc, user_memberships and users.social.groupIds change in ONE batch (axiom 17).
 * Only `demo-` group ids are ever added or removed.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isDemoTenantId, isDemoUid } from '@/lib/demo';

function assertViewerAndGroups(uid: string, groupIds: readonly string[]): void {
  if (!uid || isDemoUid(uid)) throw new Error('viewer must be a real (non-demo) uid');
  if (groupIds.some((g) => !isDemoTenantId(g))) throw new Error('viewer membership: demo groups only');
}

export async function joinDemoGroupAsViewer(db: Firestore, uid: string, name: string, groupId: string, chatId: string): Promise<void> {
  assertViewerAndGroups(uid, [groupId]);
  const batch = db.batch();
  batch.set(db.doc(`community_groups/${groupId}/members/${uid}`), { uid, name, role: 'member', joinedAt: FieldValue.serverTimestamp(), isViewer: true });
  batch.set(db.doc(`chats/${chatId}`), { participants: FieldValue.arrayUnion(uid), participantNames: { [uid]: name } }, { merge: true });
  batch.set(db.doc(`user_memberships/${uid}`), { groupIds: FieldValue.arrayUnion(groupId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.doc(`users/${uid}`), { social: { groupIds: FieldValue.arrayUnion(groupId) } }, { mergeFields: ['social.groupIds'] });
  await batch.commit();
}

/** Removes demo group ids from the viewer's two membership mirrors (the member docs go with the groups). */
export async function leaveDemoGroupsAsViewer(db: Firestore, uid: string, groupIds: readonly string[]): Promise<void> {
  assertViewerAndGroups(uid, groupIds);
  if (!groupIds.length) return;
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), { social: { groupIds: FieldValue.arrayRemove(...groupIds) } }, { mergeFields: ['social.groupIds'] });
  batch.set(db.doc(`user_memberships/${uid}`), { groupIds: FieldValue.arrayRemove(...groupIds) }, { merge: true });
  await batch.commit();
}
