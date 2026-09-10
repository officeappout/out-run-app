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
 * SPEC-04 Wave B/D (POLICY-01): userPublicSync mirrors ANY discoverable
 * user into this collection, minors included (ageGroup is one of the
 * mirrored fields) — this IS the search index, so a minor's name reaching
 * it and a name search having no age boundary were the same bug. Every
 * search now requires callerAgeGroup and filters where('ageGroup','==',
 * callerAgeGroup) — mirrors the presence fix (nearbyPresence.service.ts):
 * a minor never appears in an adult's search results and vice versa. The
 * matching firestore.rules split (allow list, age-scoped; allow get,
 * unrestricted — a get is always by an already-known uid from an
 * already-scoped source like a group roster, not a discovery surface) is
 * what makes this provable — the where() clause here is REQUIRED, not
 * optional, or the whole query is rejected outright.
 *
 * Queries `userPublic` by name prefix, optionally scoped to one
 * authority (city). Requires composite index: authorityId + ageGroup + name.
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
 * here. `callerAgeGroup` is required (SPEC-04 Wave B/D) — see the
 * top-of-file comment for why this can't be optional. Returns up to
 * `max` results.
 */
export async function searchUsersByName(
  term: string,
  callerAgeGroup: 'minor' | 'adult',
  authorityId?: string,
  max = 10,
): Promise<UserSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const end = trimmed + '\uf8ff';

  const constraints: QueryConstraint[] = [where('ageGroup', '==', callerAgeGroup)];

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
 *
 * SPEC-04 Wave B/D: `documentId() in [...]` is a `list` operation, same as
 * searchUsersByName — userPublic's list rule now requires a matching
 * where('ageGroup','==', X) clause to be provable at all (see the rule
 * comment), so `callerAgeGroup` is required here too, or every call fails
 * outright with PERMISSION_DENIED, not just a search call. Side effect
 * worth flagging: nothing in this codebase currently blocks a minor and an
 * adult from following each other (checked: connections/{uid}'s Firestore
 * rule has no age condition), so if any such cross-age follow exists in
 * production today, that specific followed user will silently stop
 * appearing in "my followed users" after this change — this is the
 * correct behavior per POLICY-01 §3's "a minor must not receive lists of
 * adults either," but is a real, addressed-here side effect, not a
 * hypothetical, and David should know it's possible.
 */
export async function getUsersByUids(
  uids: string[],
  callerAgeGroup: 'minor' | 'adult',
): Promise<UserSearchResult[]> {
  if (!uids.length) return [];

  // Dedupe input — `documentId() in [...]` rejects duplicates.
  const unique = Array.from(new Set(uids));

  const byUid = new Map<string, UserSearchResult>();

  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const q = query(
      collection(db, 'userPublic'),
      where(documentId(), 'in', batch),
      where('ageGroup', '==', callerAgeGroup),
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
