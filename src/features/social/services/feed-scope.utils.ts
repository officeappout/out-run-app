/**
 * Extracts leaderboard scope fields from a user profile for feed post enrichment.
 */

export interface FeedScopeFields {
  authorityId?: string;
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
