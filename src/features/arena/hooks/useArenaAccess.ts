'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user';
import { deriveArenaAccess } from './derive-arena-access';

export type { ArenaTabKey, ArenaTab, ArenaAccess } from './derive-arena-access';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * hasReserveAccess/hasUnitLeagueAccess are explicit params, not derived
 * internally, because their only correct source (a live
 * military_declarations listener — see useHasDeclaredReserveStatus.ts)
 * would be wasteful to mount for every one of this hook's many consumers
 * (active workout screen, running player store, onboarding's PersonaStep,
 * etc.) — most of which have no use for either. Callers that need these
 * tabs (currently just /community) mount that listener themselves and pass
 * the results in; everyone else defaults to false, exactly as before
 * either existed.
 */
export function useArenaAccess(hasReserveAccess = false, hasUnitLeagueAccess = false) {
  const { profile, _hasHydrated } = useUserStore();

  return useMemo(
    () => deriveArenaAccess(profile?.core, _hasHydrated, hasReserveAccess, hasUnitLeagueAccess),
    [
      profile?.core?.affiliations,
      profile?.core?.ageGroup,
      profile?.core?.birthDate,
      profile?.core?.authorityId,
      profile?.core?.neighborhoodId,
      profile?.core,
      hasReserveAccess,
      hasUnitLeagueAccess,
      _hasHydrated,
    ],
  );
}
