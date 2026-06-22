// EVAL TEST 2 — should PASS
// Correct pattern: calls updateSocialGroupIds through authorized service
import { updateSocialGroupIds } from '@/features/arena/services/group.service';

export async function joinGroup(uid: string, groupId: string) {
  await updateSocialGroupIds(uid, groupId, 'join');
}
