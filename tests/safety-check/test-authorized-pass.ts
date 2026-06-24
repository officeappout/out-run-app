// EVAL TEST 4 — should PASS when treated as authorized path
// Simulates the write pattern that exists in group-membership/route.ts line 61:
//   'social.groupIds': membershipUpdate
// Used to verify the authorized-file exception works.
import { FieldValue } from 'firebase-admin/firestore';

const membershipUpdate = FieldValue.arrayUnion('group-123');
const update = {
  'social.groupIds': membershipUpdate,
  updatedAt: FieldValue.serverTimestamp(),
};
