/**
 * Pure derivation logic for ArenaAccess, split out of useArenaAccess.ts so it
 * has zero value-imports from '@/features/user' (whose barrel re-exports
 * React components with JSX, which the pure-logic/node vitest environment
 * can't parse — see vitest.config.ts). useArenaAccess.ts wraps this in
 * useMemo; deriveArenaAccess itself is unit-testable directly.
 */
import type { UserFullProfile } from '@/features/user/core/types/user.types';

// ─── Tab types ───────────────────────────────────────────────────────────────

export type ArenaTabKey = 'city' | 'org' | 'park' | 'global' | 'reserve';

export interface ArenaTab {
  key: ArenaTabKey;
  label: string;
}

// ─── Access shape ─────────────────────────────────────────────────────────────

export interface ArenaAccess {
  cityAuthorityId: string | null;
  cityName: string | null;
  hasCityAccess: boolean;
  /** authorities/{id} doc id of the user's neighborhood, scoped under cityAuthorityId. */
  neighborhoodAuthorityId: string | null;
  /**
   * No stored display name for the neighborhood exists on core today (only
   * cityAff carries a name, via affiliations) — null until a lookup or a
   * stored neighborhoodName field is added. Not resolved here to avoid an
   * extra read on every hook call; callers needing a label should look it
   * up via the authorities doc when rendering.
   */
  neighborhoodName: string | null;
  hasNeighborhoodAccess: boolean;
  schoolCode: string | null;
  schoolName: string | null;
  hasSchoolAccess: boolean;
  isLoading: boolean;

  /** 'school' for minors, 'university' for adults with school affiliation, 'work' for company, 'youth_movement' for youth organizations */
  orgType: 'school' | 'university' | 'work' | 'youth_movement' | null;
  orgId: string | null;
  orgName: string | null;
  ageGroup: 'minor' | 'adult';
  preferredParkId: string | null;
  preferredParkName: string | null;
  /**
   * Declared military_declarations.status === 'reserve' (Phase 6a). Sourced
   * from a live listener on the declaration itself, NOT from community_groups
   * membership — that membership is server-CF-driven and can lag behind (or
   * fail outright) without this tab's visibility depending on it. See
   * useHasDeclaredReserveStatus.ts.
   */
  hasReserveAccess: boolean;
  /** Ordered list of tabs the user has access to (always includes 'ארצי') */
  activeTabs: ArenaTab[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveAgeGroup(birthDate: Date | undefined): 'minor' | 'adult' {
  if (!birthDate) return 'adult';
  const ageYears = (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

// ─── Pure derivation ────────────────────────────────────────────────────────

export function deriveArenaAccess(
  core: UserFullProfile['core'] | undefined,
  hasHydrated: boolean,
  hasReserveAccess = false,
): ArenaAccess {
  const affiliations = core?.affiliations ?? [];

  const cityAff = affiliations.find((a) => a.type === 'city');
  const orgAff = affiliations.find(
    (a) => a.type === 'school' || a.type === 'company' || a.type === 'youth_movement',
  );

  const cityAuthorityId = cityAff?.id ?? core?.authorityId ?? null;
  const hasCityAccess = !!cityAuthorityId;

  const neighborhoodAuthorityId = core?.neighborhoodId ?? null;
  const hasNeighborhoodAccess = !!neighborhoodAuthorityId;

  const ageGroup: 'minor' | 'adult' = core?.ageGroup ?? deriveAgeGroup(core?.birthDate);

  let orgType: 'school' | 'university' | 'work' | 'youth_movement' | null = null;
  let orgLabel = '';
  if (orgAff) {
    if (orgAff.type === 'school') {
      orgType = ageGroup === 'minor' ? 'school' : 'university';
      orgLabel = ageGroup === 'minor' ? 'בית ספר' : 'אוני׳ / קמפוס';
    } else if (orgAff.type === 'company') {
      orgType = 'work';
      orgLabel = 'עבודה';
    } else if (orgAff.type === 'youth_movement') {
      orgType = 'youth_movement';
      orgLabel = 'תנועת נוער';
    }
  }

  const preferredParkId = (core as Record<string, unknown>)?.preferredParkId as string | null ?? null;
  const preferredParkName = (core as Record<string, unknown>)?.preferredParkName as string | null ?? null;

  // Build ordered dynamic tab list — 'ארצי' always first
  const activeTabs: ArenaTab[] = [
    { key: 'global', label: 'ארצי' },
  ];
  if (hasCityAccess) activeTabs.push({ key: 'city', label: 'עיר' });
  if (orgType) activeTabs.push({ key: 'org', label: orgLabel });
  if (preferredParkId) activeTabs.push({ key: 'park', label: 'פארק' });
  // hasReserveAccess is passed in, not derived here — see the caller
  // (useArenaAccess/community's page) for why it's sourced from a live
  // military_declarations listener rather than community_groups membership.
  if (hasReserveAccess) activeTabs.push({ key: 'reserve', label: 'מילואים' });

  return {
    cityAuthorityId,
    cityName: cityAff?.name ?? null,
    hasCityAccess,
    neighborhoodAuthorityId,
    neighborhoodName: null,
    hasNeighborhoodAccess,
    schoolCode: orgAff?.id ?? null,
    schoolName: orgAff?.name ?? null,
    hasSchoolAccess: !!orgAff && (orgAff.tier ?? 0) >= 3,
    isLoading: !hasHydrated,

    orgType,
    orgId: orgAff?.id ?? null,
    orgName: orgAff?.name ?? null,
    ageGroup,
    preferredParkId,
    preferredParkName,
    hasReserveAccess,
    activeTabs,
  };
}
