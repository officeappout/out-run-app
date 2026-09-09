/**
 * User Search Service
 *
 * SPEC-03 Wave B (SEC-06): queries `userPublic` now, not `users` — the
 * full profile document is owner+admin only. userPublic only ever holds
 * a doc for a user with core.discoverable == true (see userPublicSync.ts
 * and the firestore.rules comment on the userPublic match block), so
 * existence in this collection IS the discoverable filter — no
 * discoverable field/where-clause needed here anymore.
 *
 * Queries `userPublic` by name prefix, optionally scoped to one
 * authority (city). Requires composite index: authorityId + name.
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
 * Optionally scoped by authorityId (city). Only discoverable users are
 * ever returned — enforced by userPublic's own existence, not a filter
 * here. Returns up to `max` results.
 */
export async function searchUsersByName(
  term: string,
  authorityId?: string,
  max = 10,
): Promise<UserSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const end = trimmed + '\uf8ff';

  const constraints: QueryConstraint[] = [];

  if (authorityId) {
    constraints.push(where('authorityId', '==', authorityId));
  }

  constraints.push(
    orderBy('name'),
    where('name', '>=', trimmed),
    where('name', '<=', end),
    limit(max),
  );

  const q = query(collection(db, 'userPublic'), ...constraints);

  const snap = await getDocs(q);
  const results: UserSearchResult[] = [];

  snap.forEach((d) => {
    const data = d.data();
    results.push({
      uid: d.id,
      name: data.name ?? 'ללא שם',
      photoURL: data.photoURL ?? undefined,
      fitnessLevel: data.initialFitnessTier
        ? `רמה ${data.initialFitnessTier}`
        : undefined,
      currentLevel: data.currentLevel ?? undefined,
    });
  });

  return results;
}

/**
 * Fetch user docs for an explicit list of UIDs (e.g. "my followed users"
 * derived from `connections/{uid}.following`). Batches in chunks of 30 to
 * stay within Firestore's `in` query limit. Order is preserved relative to
 * the input UIDs so the caller can render in their preferred sequence.
 *
 * SPEC-03 Wave B (SEC-06): reads userPublic now, not users — doc ID is
 * still the uid (unchanged), so `documentId() in [...]` keeps working
 * exactly as before. A followed user who isn't discoverable simply has
 * no userPublic doc and is silently omitted, same practical behavior as
 * the old rule's per-doc discoverable check on this exact query shape.
 */
export async function getUsersByUids(uids: string[]): Promise<UserSearchResult[]> {
  if (!uids.length) return [];

  // Dedupe input — `documentId() in [...]` rejects duplicates.
  const unique = Array.from(new Set(uids));

  const byUid = new Map<string, UserSearchResult>();

  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const q = query(
      collection(db, 'userPublic'),
      where(documentId(), 'in', batch),
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      byUid.set(d.id, {
        uid: d.id,
        name: data.name ?? 'ללא שם',
        photoURL: data.photoURL ?? undefined,
        fitnessLevel: data.initialFitnessTier
          ? `רמה ${data.initialFitnessTier}`
          : undefined,
        currentLevel: data.currentLevel ?? undefined,
      });
    });
  }

  // Preserve input ordering, drop UIDs that resolved to nothing
  // (e.g. deleted accounts).
  return unique.map((uid) => byUid.get(uid)).filter((u): u is UserSearchResult => !!u);
}
