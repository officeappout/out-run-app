// EVAL TEST 3 — boundary: pattern appears in comment only, not as a real write
// Previously we wrote 'social.groupIds': directly — that is now blocked.
// The correct way is via updateSocialGroupIds from group.service.
import { updateSocialGroupIds } from '@/features/arena/services/group.service';

export async function safeJoin(uid: string, groupId: string) {
  // Note: 'social.groupIds': is the Firestore field name — do not write directly
  await updateSocialGroupIds(uid, groupId, 'join');
}
