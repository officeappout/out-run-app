/**
 * Extracts leaderboard scope fields from a user profile for feed post enrichment.
 */

export interface FeedScopeFields {
  authorityId?: string;
  schoolId?: string;
  ageGroup?: 'minor' | 'adult';
}

export function extractFeedScope(profile: any): FeedScopeFields {
  const affiliations = profile?.core?.affiliations ?? [];

  const cityAff = affiliations.find((a: any) => a.type === 'city');
  const schoolAff = affiliations.find(
    (a: any) => a.type === 'school' || a.type === 'company',
  );

  const birthDate = profile?.core?.birthDate;
  let ageGroup: 'minor' | 'adult' = 'minor';
  if (birthDate) {
    const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (!isNaN(bd.getTime())) {
      const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      ageGroup = ageYears >= 18 ? 'adult' : 'minor';
    }
  }

  return {
    authorityId: cityAff?.id ?? undefined,
    schoolId: schoolAff?.id ?? undefined,
    ageGroup,
  };
}
