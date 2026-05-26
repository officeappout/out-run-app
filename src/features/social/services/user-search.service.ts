/**
 * User Search Service
 *
 * Queries the Firestore `users` collection by name prefix,
 * scoped to discoverable users within the same authority (city).
 * Requires composite index: core.discoverable + core.authorityId + core.name
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  documentId,
  QueryConstraint,
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
 * Filters by discoverable == true and optionally by authorityId (city).
 * Returns up to `max` results.
 */
export async function searchUsersByName(
  term: string,
  authorityId?: string,
  max = 10,
): Promise<UserSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const end = trimmed + '\uf8ff';

  const constraints: QueryConstraint[] = [
    where('core.discoverable', '==', true),
  ];

  if (authorityId) {
    constraints.push(where('core.authorityId', '==', authorityId));
  }

  constraints.push(
    orderBy('core.name'),
    where('core.name', '>=', trimmed),
    where('core.name', '<=', end),
    limit(max),
  );

  const q = query(collection(db, 'users'), ...constraints);

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

/**
 * Fetch user docs for an explicit list of UIDs (e.g. "my followed users"
 * derived from `connections/{uid}.following`). Batches in chunks of 30 to
 * stay within Firestore's `in` query limit. Order is preserved relative to
 * the input UIDs so the caller can render in their preferred sequence.
 */
export async function getUsersByUids(uids: string[]): Promise<UserSearchResult[]> {
  if (!uids.length) return [];

  // Dedupe input — `documentId() in [...]` rejects duplicates.
  const unique = Array.from(new Set(uids));

  const byUid = new Map<string, UserSearchResult>();

  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const q = query(
      collection(db, 'users'),
      where(documentId(), 'in', batch),
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      byUid.set(d.id, {
        uid: d.id,
        name: data.core?.name ?? 'ללא שם',
        photoURL: data.core?.photoURL ?? undefined,
        fitnessLevel: data.core?.initialFitnessTier
          ? `רמה ${data.core.initialFitnessTier}`
          : undefined,
        currentLevel: data.progression?.currentLevel ?? undefined,
      });
    });
  }

  // Preserve input ordering, drop UIDs that resolved to nothing
  // (e.g. deleted accounts).
  return unique.map((uid) => byUid.get(uid)).filter((u): u is UserSearchResult => !!u);
}
