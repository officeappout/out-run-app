/**
 * Extracts leaderboard scope fields from a user profile for feed post enrichment.
 */

export interface FeedScopeFields {
  authorityId?: string;
  neighborhoodId?: string;
  schoolId?: string;
  ageGroup?: 'minor' | 'adult';
  gender?: 'male' | 'female' | 'other';
}

export function extractFeedScope(profile: any): FeedScopeFields {
  const affiliations = profile?.core?.affiliations ?? [];

  const cityAff = affiliations.find((a: any) => a.type === 'city');
  const schoolAff = affiliations.find(
    (a: any) => a.type === 'school' || a.type === 'company',
  );

  // Prefer the explicit core.ageGroup field (same logic as useArenaAccess).
  // Fall back to birthDate calculation; default to 'adult' when neither is set
  // so queries match seed data and real users who skip the birthday step.
  const explicitAge = profile?.core?.ageGroup as 'minor' | 'adult' | undefined;
  let ageGroup: 'minor' | 'adult' = explicitAge ?? 'adult';
  if (!explicitAge) {
    const birthDate = profile?.core?.birthDate;
    if (birthDate) {
      const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
      if (!isNaN(bd.getTime())) {
        const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        ageGroup = ageYears >= 18 ? 'adult' : 'minor';
      }
    }
  }

  const rawGender = profile?.core?.gender;
  const gender: 'male' | 'female' | 'other' | undefined =
    rawGender === 'male' || rawGender === 'female' || rawGender === 'other'
      ? rawGender
      : undefined;

  return {
    authorityId: cityAff?.id ?? undefined,
    neighborhoodId: profile?.core?.neighborhoodId ?? undefined,
    schoolId: schoolAff?.id ?? undefined,
    ageGroup,
    gender,
  };
}

/**
 * Returns the IDs of every community_groups the user has joined.
 * Stamped on feed_posts so group/league leaderboards can query by
 * `where('groupIds', 'array-contains', groupId)`.
 */
export function extractGroupIds(profile: any): string[] {
  return Array.isArray(profile?.social?.groupIds) ? profile.social.groupIds : [];
}

/**
 * Make a post's rule-checked scope fields match the author's own users/{uid}
 * doc exactly — the feed_posts create rule (firestore.rules, 11.10.2026)
 * requires neighborhoodId / ageGroup / gender to EQUAL the doc's core values
 * (null when missing) and every groupId to be in the doc's social.groupIds.
 *
 * Why (David, 17.10.2026 — "I finished a workout and no post appeared"):
 * extractFeedScope falls back to ageGroup 'adult' (or one computed from
 * birthDate) when core.ageGroup isn't on the doc — legacy accounts — so the
 * create was rejected with permission-denied and the post silently vanished
 * (createWorkoutPost swallows errors). Same for a stale client profile.
 * `userDoc` undefined (couldn't read it) → params unchanged.
 */
export function alignScopeWithAuthorDoc<
  P extends { neighborhoodId?: string; ageGroup?: 'minor' | 'adult'; gender?: 'male' | 'female' | 'other'; groupIds?: string[] },
>(params: P, userDoc: unknown): P {
  if (!userDoc || typeof userDoc !== 'object') return params;
  const d = userDoc as { core?: Record<string, unknown>; social?: { groupIds?: unknown } };
  const core = d.core ?? {};
  const own = (v: unknown) => (v === null || v === undefined ? undefined : v);
  const docGroups = Array.isArray(d.social?.groupIds) ? (d.social!.groupIds as unknown[]) : [];
  return {
    ...params,
    neighborhoodId: own(core.neighborhoodId) as P['neighborhoodId'],
    ageGroup: own(core.ageGroup) as P['ageGroup'],
    gender: own(core.gender) as P['gender'],
    groupIds: (params.groupIds ?? []).filter((g) => docGroups.includes(g)),
  };
}
