'use client';

import { useState, useEffect } from 'react';
import { getAllParks } from '@/features/parks';
import { getAuthority } from '@/features/admin/services/authority.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Authority } from '@/types/admin-types';
import {
  shouldShowShelterTag,
  type ShelterDisplayDecision,
} from '@/features/parks/core/services/shelter-proximity.service';

interface UseShelterProximityOptions {
  park: Park | null | undefined;
  /** Pre-loaded authority — skips Firestore fetch if provided */
  authority?: Authority | null;
}

const EMPTY: ShelterDisplayDecision = { show: false, proximity: null };

/**
 * Hook that determines whether a park should display the shelter proximity tag.
 * Loads the park's authority settings and all parks with `safe_zone` tag,
 * then runs the dual-mode calculation.
 */
export function useShelterProximity({
  park,
  authority: preloadedAuthority,
}: UseShelterProximityOptions): ShelterDisplayDecision {
  const [decision, setDecision] = useState<ShelterDisplayDecision>(EMPTY);

  useEffect(() => {
    if (!park?.authorityId) {
      setDecision(EMPTY);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [auth, allParks] = await Promise.all([
          preloadedAuthority
            ? Promise.resolve(preloadedAuthority)
            : getAuthority(park.authorityId!),
          getAllParks(),
        ]);

        if (cancelled) return;

        const result = shouldShowShelterTag(park, allParks, auth);
        setDecision(result);
      } catch {
        if (!cancelled) setDecision(EMPTY);
      }
    })();

    return () => { cancelled = true; };
  }, [park?.id, park?.authorityId, preloadedAuthority?.id]);

  return decision;
}
