'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user';
import { deriveArenaAccess } from './derive-arena-access';

export type { ArenaTabKey, ArenaTab, ArenaAccess } from './derive-arena-access';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useArenaAccess() {
  const { profile, _hasHydrated } = useUserStore();

  return useMemo(
    () => deriveArenaAccess(profile?.core, _hasHydrated),
    [
      profile?.core?.affiliations,
      profile?.core?.ageGroup,
      profile?.core?.birthDate,
      profile?.core?.authorityId,
      profile?.core?.neighborhoodId,
      profile?.core,
      _hasHydrated,
    ],
  );
}
