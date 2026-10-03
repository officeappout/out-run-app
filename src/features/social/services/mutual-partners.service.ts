/**
 * Mutual Partners Service ("public profile" slice 1).
 *
 * useSocialStore's `isPartner()` only ever answers "is X a mutual follow
 * of ME" — there was no existing way to compute "who are THIS OTHER
 * user's mutual-follow partners" for a public-profile viewer. This reads
 * the SAME `connections/{uid}` doc the store reads, just for an arbitrary
 * target uid instead of the signed-in uid — confirmed safe via
 * firestore.rules: `connections/{userId}` has `allow read: if
 * isAuthenticated();`, not owner-restricted, so any signed-in viewer may
 * read any user's connections doc.
 *
 * Resolves the intersected uids via the existing getUsersByUids (already
 * built "for exactly this" per its own doc comment), excluding the
 * viewer themselves — showing "you" as a highlight on your own public
 * profile view would be redundant, not informative.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUsersByUids, type UserSearchResult } from './user-search.service';

export async function getMutualPartners(
  targetUid: string,
  callerAgeGroup: 'minor' | 'adult',
  excludeUid?: string,
): Promise<UserSearchResult[]> {
  const snap = await getDoc(doc(db, 'connections', targetUid));
  if (!snap.exists()) return [];

  const data = snap.data() as { following?: string[]; followers?: string[] };
  const following = new Set(data.following ?? []);
  const mutualUids = (data.followers ?? []).filter(
    (uid) => following.has(uid) && uid !== excludeUid,
  );

  return getUsersByUids(mutualUids, callerAgeGroup);
}
