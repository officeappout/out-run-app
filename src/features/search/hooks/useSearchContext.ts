'use client';

/**
 * What the providers search over that lives in React state: the user, their position, and the
 * same community lists today's search tabs load (useArenaData for the city, useMyGroups).
 */
import { useMemo } from 'react';
import { useUserStore } from '@/features/user';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import { useMyGroups } from '@/features/arena/hooks/useMyGroups';
import { useUserLocation } from '@/features/arena/hooks/useUserLocation';
import { computeAgeGroup } from '@/lib/age';
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import type { LatLng } from '../core/types';

export interface SearchContext {
  uid: string | null;
  ageGroup: 'minor' | 'adult';
  pos: LatLng | null;
  groups: CommunityGroup[];
  myGroups: CommunityGroup[];
  events: CommunityEvent[];
  hasCityAccess: boolean;
}

export function useSearchContext(): SearchContext {
  const profile = useUserStore((s) => s.profile);
  const access = useArenaAccess();
  const { events, groups } = useArenaData(access.cityAuthorityId);
  const { groups: myGroups } = useMyGroups();
  const { userCoords } = useUserLocation();
  // SPEC-04: a missing ageGroup falls to 'minor' (same fail-safe as today's search page)
  const ageGroup: 'minor' | 'adult' = profile?.core?.ageGroup ?? computeAgeGroup(profile?.core?.birthDate);
  const lat = userCoords?.lat;
  const lng = userCoords?.lng;
  const pos = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng]);
  return {
    uid: profile?.id ?? null,
    ageGroup,
    pos,
    groups,
    myGroups,
    events,
    hasCityAccess: access.hasCityAccess,
  };
}
