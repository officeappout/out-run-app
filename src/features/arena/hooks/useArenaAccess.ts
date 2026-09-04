'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user';
import { deriveArenaAccess } from './derive-arena-access';

export { RESERVE_LEAGUE_GROUP_ID } from '@/lib/military-reserve-league';
export type { ArenaTabKey, ArenaTab, ArenaAccess } from './derive-arena-access';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useArenaAccess() {
  const { profile, _hasHydrated } = useUserStore();
  const socialGroupIds = profile?.social?.groupIds;

  return useMemo(
    () => deriveArenaAccess(profile?.core, _hasHydrated, socialGroupIds),
    [
      profile?.core?.affiliations,
      profile?.core?.ageGroup,
      profile?.core?.birthDate,
      profile?.core?.authorityId,
      profile?.core?.neighborhoodId,
      profile?.core,
      socialGroupIds,
      _hasHydrated,
    ],
  );
}
