// EVAL TEST 1 — should BLOCK
// Direct social.groupIds write outside authorized path
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function illegalWrite(uid: string, groupId: string) {
  const db = getAdminDb();
  await db.collection('users').doc(uid).update({
    'social.groupIds': FieldValue.arrayUnion(groupId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
