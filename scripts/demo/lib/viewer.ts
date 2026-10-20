/**
 * Viewers: the owner's REAL test accounts that may see the demo world
 * (demo_registry/viewers.uids — the guards in functions/src/lib/demo-world.ts read it).
 *
 * addViewer always: adds the uid to demo_registry/viewers and to managerIds of the demo
 * authorities (demo docs only). With `groups: true` it also joins the demo groups the way
 * joinEngine does (member doc + group chat participant + the viewer's social.groupIds +
 * user_memberships) — the only writes to a real account's docs; purge.ts removes exactly
 * those ids again (it never deletes a viewer's own docs).
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isDemoUid } from '@/lib/demo';
import { DEMO_CITIES, DEMO_UNITS, REGISTRY_COLLECTION, REGISTRY_DOCS } from './config';
import { DEMO_GROUPS, groupChatId } from './social';

export interface AddViewerResult {
  uid: string;
  managerOf: string[];
  groups: string[];
}

export async function addViewer(db: Firestore, uid: string, opts: { groups?: boolean; name?: string } = {}): Promise<AddViewerResult> {
  if (!uid || uid.includes('/')) throw new Error('uid לא תקין');
  if (isDemoUid(uid)) throw new Error('צופה הוא חשבון אמיתי, לא משתמש demo_');
  await db.collection(REGISTRY_COLLECTION).doc(REGISTRY_DOCS.viewers).set({ uids: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const managerOf: string[] = [];
  for (const id of [...DEMO_CITIES.map((c) => c.id), ...DEMO_UNITS.map((u) => u.id)]) {
    const ref = db.collection('authorities').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.isDemo !== true) continue; // only ever a demo authority
    await ref.update({ managerIds: FieldValue.arrayUnion(uid) });
    managerOf.push(id);
  }

  const groups: string[] = [];
  if (opts.groups) {
    const name = opts.name ?? 'צופה';
    for (const g of DEMO_GROUPS) {
      const snap = await db.collection('community_groups').doc(g.id).get();
      if (!snap.exists || snap.data()?.isDemo !== true) continue;
      const batch = db.batch();
      batch.set(db.doc(`community_groups/${g.id}/members/${uid}`), { uid, name, role: 'member', joinedAt: FieldValue.serverTimestamp(), isViewer: true });
      batch.set(db.doc(`chats/${groupChatId(g.id)}`), { participants: FieldValue.arrayUnion(uid), participantNames: { [uid]: name } }, { merge: true });
      batch.set(db.doc(`user_memberships/${uid}`), { groupIds: FieldValue.arrayUnion(g.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.set(db.doc(`users/${uid}`), { social: { groupIds: FieldValue.arrayUnion(g.id) } }, { mergeFields: ['social.groupIds'] });
      await batch.commit();
      groups.push(g.id);
    }
  }
  return { uid, managerOf, groups };
}
