'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user';

// ─── Tab types ───────────────────────────────────────────────────────────────

export type ArenaTabKey = 'city' | 'org' | 'park' | 'global';

export interface ArenaTab {
  key: ArenaTabKey;
  label: string;
}

// ─── Access shape ─────────────────────────────────────────────────────────────

export interface ArenaAccess {
  cityAuthorityId: string | null;
  cityName: string | null;
  hasCityAccess: boolean;
  schoolCode: string | null;
  schoolName: string | null;
  hasSchoolAccess: boolean;
  isLoading: boolean;

  /** 'school' for minors, 'university' for adults with school affiliation, 'work' for company */
  orgType: 'school' | 'university' | 'work' | null;
  orgId: string | null;
  orgName: string | null;
  ageGroup: 'minor' | 'adult';
  preferredParkId: string | null;
  preferredParkName: string | null;
  /** Ordered list of tabs the user has access to (always includes 'ארצי') */
  activeTabs: ArenaTab[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveAgeGroup(birthDate: Date | undefined): 'minor' | 'adult' {
  if (!birthDate) return 'adult';
  const ageYears = (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useArenaAccess(): ArenaAccess {
  const { profile, _hasHydrated } = useUserStore();

  return useMemo(() => {
    const core = profile?.core;
    const affiliations = core?.affiliations ?? [];

    const cityAff = affiliations.find((a) => a.type === 'city');
    const orgAff = affiliations.find((a) => a.type === 'school' || a.type === 'company');

    const cityAuthorityId = cityAff?.id ?? core?.authorityId ?? null;
    const hasCityAccess = !!cityAuthorityId;

    const ageGroup: 'minor' | 'adult' = core?.ageGroup ?? deriveAgeGroup(core?.birthDate);

    let orgType: 'school' | 'university' | 'work' | null = null;
    let orgLabel = '';
    if (orgAff) {
      if (orgAff.type === 'school') {
        orgType = ageGroup === 'minor' ? 'school' : 'university';
        orgLabel = ageGroup === 'minor' ? 'בית ספר' : 'אוני׳ / קמפוס';
      } else if (orgAff.type === 'company') {
        orgType = 'work';
        orgLabel = 'עבודה';
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

    return {
      cityAuthorityId,
      cityName: cityAff?.name ?? null,
      hasCityAccess,
      schoolCode: orgAff?.id ?? null,
      schoolName: orgAff?.name ?? null,
      hasSchoolAccess: !!orgAff && (orgAff.tier ?? 0) >= 3,
      isLoading: !_hasHydrated,

      orgType,
      orgId: orgAff?.id ?? null,
      orgName: orgAff?.name ?? null,
      ageGroup,
      preferredParkId,
      preferredParkName,
      activeTabs,
    };
  }, [
    profile?.core?.affiliations,
    profile?.core?.ageGroup,
    profile?.core?.birthDate,
    profile?.core?.authorityId,
    profile?.core,
    _hasHydrated,
  ]);
}
