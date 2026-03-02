/**
 * User Search Service
 *
 * Queries the Firestore `users` collection by name prefix.
 * Uses a range query on `core.name` for Hebrew-friendly prefix search.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface UserSearchResult {
  uid: string;
  name: string;
  photoURL?: string;
  fitnessLevel?: string;
  currentLevel?: string;
}

/**
 * Search users by name prefix (case-sensitive for Hebrew).
 * Returns up to `max` results.
 */
export async function searchUsersByName(
  term: string,
  max = 10,
): Promise<UserSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const end = trimmed + '\uf8ff';

  const q = query(
    collection(db, 'users'),
    orderBy('core.name'),
    where('core.name', '>=', trimmed),
    where('core.name', '<=', end),
    limit(max),
  );

  const snap = await getDocs(q);
  const results: UserSearchResult[] = [];

  snap.forEach((d) => {
    const data = d.data();
    results.push({
      uid: d.id,
      name: data.core?.name ?? 'ללא שם',
      photoURL: data.core?.photoURL ?? undefined,
      fitnessLevel: data.core?.initialFitnessTier
        ? `רמה ${data.core.initialFitnessTier}`
        : undefined,
      currentLevel: data.progression?.currentLevel ?? undefined,
    });
  });

  return results;
}
