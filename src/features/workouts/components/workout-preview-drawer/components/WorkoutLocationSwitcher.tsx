'use client';

/**
 * WorkoutLocationSwitcher — workout-level "swap all → <location>" control.
 *
 * A thin adapter: it builds the 3 location options and owns open state, then renders
 * the SHARED LocationVariantSwitcher — the exact same pixel-for-pixel dropdown as the
 * per-exercise single toggle in MasterExerciseView (one visual source of truth). Only
 * mounted behind SWAP_ALL_ENABLED.
 */

import { useState } from 'react';
import type { ExecutionLocation } from '@/features/content/exercises';
import LocationVariantSwitcher, {
  type LocationSwitcherOption,
} from '@/features/content/exercises/client/components/LocationVariantSwitcher';
import {
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

// Street intentionally omitted: data coverage is too thin, so it produces a flood of
// "requires a station" keep-marks. Product decision — offer only park + home.
const LOCATIONS: ExecutionLocation[] = ['home', 'park'];

// Representative equipment per location for the sub-label. Illustrative only — the
// REAL per-exercise gear is resolved during the swap; this mirrors the single-toggle
// look (park = fixed bars; home falls to the "משקל גוף" placeholder).
const REPRESENTATIVE_GEAR: Record<string, string[]> = {
  home: [],
  park: ['pullup_bar', 'dip_station'],
};

function gearChips(location: string): LocationSwitcherOption['gear'] {
  return (REPRESENTATIVE_GEAR[location] ?? [])
    .map((id) => {
      const label = resolveEquipmentLabel(id);
      if (!label || label === 'ציוד לא מזוהה') return null;
      return { id, label, icon: resolveEquipmentSvgPathList(id)[0] ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

interface WorkoutLocationSwitcherProps {
  currentLocation: ExecutionLocation;
  isSwapping: boolean;
  onSwap: (value: ExecutionLocation) => void;
}

export default function WorkoutLocationSwitcher({
  currentLocation,
  isSwapping,
  onSwap,
}: WorkoutLocationSwitcherProps) {
  const [open, setOpen] = useState(false);

  const options: LocationSwitcherOption[] = LOCATIONS.map((loc) => ({
    key: loc,
    location: loc,
    gear: gearChips(loc),
    isActive: loc === currentLocation,
  }));

  return (
    <div dir="rtl" className="mb-4 flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">איפה מתאמנים?</span>
      <LocationVariantSwitcher
        activeLocation={currentLocation}
        options={options}
        open={open}
        canSwitch={!isSwapping}
        onToggleOpen={() => setOpen((o) => !o)}
        onClose={() => setOpen(false)}
        onSelect={(opt) => {
          setOpen(false);
          if (opt.location !== currentLocation) onSwap(opt.location as ExecutionLocation);
        }}
      />
      {isSwapping && <span className="text-xs text-cyan-600 animate-pulse">מחליף…</span>}
    </div>
  );
}
