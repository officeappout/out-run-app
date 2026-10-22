/**
 * "Mapped by" credit — who put a place on the map (enable_park_mapped_by_credit).
 *
 * Pure: no Firebase, no React. Shared by the server write path (the approval
 * chokepoint stamps `mappedBy` on the park doc) and the client line that reads
 * it back. Written for parks first; routes can store the same shape later and
 * reuse resolveMappedByCredit + MappedByCreditLine unchanged.
 *
 * Stored on `parks/{id}.mappedBy` (public doc — `allow read: if true`), so
 * what is stored is itself a privacy decision:
 *   - team       — created directly by a root admin (computeParkCreate, no contribution).
 *   - authority  — created by an authority_manager. Stored for honesty, rendered as
 *                  nothing for now (open product question: "the municipality"?).
 *   - community  — created by approving a citizen's new_location contribution.
 *                  `uid` is stored ONLY when the contributor's users doc says
 *                  core.ageGroup === 'adult' at approval time. A minor's (or an
 *                  unknown-age legacy account's) uid never lands on a public doc.
 * Absent (every park created before this field existed, OSM/dataset imports,
 * old client-SDK writers) → unknown → no line at all.
 */

export type ParkMappedBy =
  | { kind: 'team' }
  | { kind: 'authority' }
  | { kind: 'community'; uid?: string; contributionId?: string };

/** The lean public-profile slice the line needs — read from userPublic/{uid}. */
export interface MappedByPublicProfile {
  name?: string;
  photoURL?: string;
  ageGroup?: 'minor' | 'adult';
}

/**
 * What the line shows.
 *  - none      → render nothing
 *  - team      → "מופה על ידי צוות OUT"
 *  - community → "מופה על ידי קהילת OUT" (no name — private / minor / unknown)
 *  - person    → photo + name, tap opens the profile
 */
export type MappedByCredit =
  | { kind: 'none' }
  | { kind: 'team' }
  | { kind: 'community' }
  | { kind: 'person'; uid: string; name: string; photoURL?: string };

/** Field guard for a raw Firestore value (never assume the shape). */
export function parseMappedBy(raw: unknown): ParkMappedBy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'team') return { kind: 'team' };
  if (r.kind === 'authority') return { kind: 'authority' };
  if (r.kind === 'community') {
    return {
      kind: 'community',
      ...(typeof r.uid === 'string' && r.uid ? { uid: r.uid } : {}),
      ...(typeof r.contributionId === 'string' && r.contributionId ? { contributionId: r.contributionId } : {}),
    };
  }
  return undefined;
}

/** The uid whose public profile must be read before deciding, or null when no read is needed. */
export function mappedByProfileUid(mappedBy: ParkMappedBy | undefined): string | null {
  return mappedBy?.kind === 'community' && mappedBy.uid ? mappedBy.uid : null;
}

/**
 * Decide what to show.
 * `profile`: `undefined` = still loading (show nothing yet, no flicker from
 * "community" to a name); `null` = no userPublic doc (not discoverable, deleted)
 * or the read failed.
 *
 * Privacy (SECURITY.md minors + the userPublic contract): a person is named only
 * when their userPublic doc exists (existence IS "discoverable") AND it says
 * ageGroup === 'adult' — strict polarity, same as the DM gate on the public
 * profile page: a missing ageGroup is not an adult.
 */
export function resolveMappedByCredit(
  mappedBy: ParkMappedBy | undefined,
  profile: MappedByPublicProfile | null | undefined,
): MappedByCredit {
  if (!mappedBy) return { kind: 'none' };
  if (mappedBy.kind === 'team') return { kind: 'team' };
  if (mappedBy.kind === 'authority') return { kind: 'none' };
  if (!mappedBy.uid) return { kind: 'community' };
  if (profile === undefined) return { kind: 'none' };
  if (profile === null || profile.ageGroup !== 'adult') return { kind: 'community' };
  const name = profile.name?.trim();
  if (!name) return { kind: 'community' };
  return {
    kind: 'person',
    uid: mappedBy.uid,
    name,
    ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
  };
}

/**
 * Server side, at approval time: the community stamp for a contributor.
 * `contributorAgeGroup` comes from users/{uid}.core.ageGroup (Admin SDK).
 * No key is ever present-with-undefined (Admin SDK rejects undefined; axiom §24).
 */
export function buildCommunityMappedBy(
  contributorUid: unknown,
  contributorAgeGroup: unknown,
  contributionId: string,
): ParkMappedBy {
  const uid = typeof contributorUid === 'string' && contributorUid ? contributorUid : null;
  return {
    kind: 'community',
    ...(uid && contributorAgeGroup === 'adult' ? { uid } : {}),
    ...(contributionId ? { contributionId } : {}),
  };
}

/** Server side: the stamp for a direct (non-contribution) create, by caller kind. */
export function directCreateMappedBy(callerKind: 'root' | 'authority_manager'): ParkMappedBy {
  return callerKind === 'root' ? { kind: 'team' } : { kind: 'authority' };
}
