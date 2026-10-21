'use client';

import type { Park } from '@/features/parks/core/types/park.types';
import { useShelterProximity } from '@/features/parks/core/hooks/useShelterProximity';
import { formatShelterTagLabel } from '@/features/parks/core/services/shelter-proximity.service';

/**
 * Shelter proximity line on the park page (enable_map_polish_v1) — moved here
 * from the map's park card, which is compact now. Same rule as before
 * (useShelterProximity: the authority's settings + nearby safe-zone parks);
 * renders nothing when the tag shouldn't show.
 */
export default function ParkShelterTag({ park }: { park: Park }) {
  const decision = useShelterProximity({ park });
  if (!decision.show || !decision.proximity) return null;
  return (
    <div className="mb-4 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-700">
      {formatShelterTagLabel(decision.proximity.walkingTimeMinutes)}
    </div>
  );
}
