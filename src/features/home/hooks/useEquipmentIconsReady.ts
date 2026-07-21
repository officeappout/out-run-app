'use client';

/**
 * useEquipmentIconsReady — gate the equipment-badge computation on the equipment
 * caches being warm, WITHOUT blocking the surrounding card.
 *
 * The gear resolvers (normalizeGearId / resolveEquipmentSvgPathList /
 * resolveEquipmentLabel) are synchronous and read module-level caches. Before those
 * caches load they return raw ids / empty icons, so a card that renders before the
 * caches are warm briefly shows a wrong/missing badge (the OaZay… flash).
 *
 * Contract:
 *   - The CARD renders immediately regardless of the return value.
 *   - Only the badge's icon `useMemo` should depend on this flag: compute icons when
 *     `true`, skip when `false`. When the caches finish loading the flag flips and
 *     the badge re-renders — the card never waited.
 *   - Warm-cache case (the common one — StatsOverview pre-warms on mount): the
 *     initial state is already `true`, so there is no flash and no behaviour change.
 */

import { useEffect, useState } from 'react';
import {
  areEquipmentCachesReady,
  ensureEquipmentCachesLoaded,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

export function useEquipmentIconsReady(): boolean {
  const [ready, setReady] = useState<boolean>(() => areEquipmentCachesReady());

  useEffect(() => {
    if (ready) return;
    let alive = true;
    ensureEquipmentCachesLoaded()
      .then(() => { if (alive) setReady(areEquipmentCachesReady()); })
      .catch(() => { /* resolvers fall back to raw ids; nothing to do */ });
    return () => { alive = false; };
  }, [ready]);

  return ready;
}
