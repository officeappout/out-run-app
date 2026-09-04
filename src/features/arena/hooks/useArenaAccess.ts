'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user';
import { deriveArenaAccess } from './derive-arena-access';

export type { ArenaTabKey, ArenaTab, ArenaAccess } from './derive-arena-access';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * hasReserveAccess is an explicit param, not derived internally, because its
 * only correct source (a live military_declarations listener — see
 * useHasDeclaredReserveStatus.ts) would be wasteful to mount for every one
 * of this hook's many consumers (active workout screen, running player
 * store, onboarding's PersonaStep, etc.) — most of which have no use for it.
 * Callers that need the reserve tab (currently just /community) mount that
 * listener themselves and pass the result in; everyone else defaults to
 * false, exactly as before this existed.
 */
export function useArenaAccess(hasReserveAccess = false) {
  const { profile, _hasHydrated } = useUserStore();

  return useMemo(
    () => deriveArenaAccess(profile?.core, _hasHydrated, hasReserveAccess),
    [
      profile?.core?.affiliations,
      profile?.core?.ageGroup,
      profile?.core?.birthDate,
      profile?.core?.authorityId,
      profile?.core?.neighborhoodId,
      profile?.core,
      hasReserveAccess,
      _hasHydrated,
    ],
  );
}
