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
import { useUserStore } from '@/features/user';
import { hasPersona } from '@/features/workout-engine/services/user-profile.utils';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';
import type { LocationAvailability } from '../hooks/useLocationSwapPlanner';

// Street intentionally omitted: data coverage is too thin, so it produces a flood of
// "requires a station" keep-marks. Product decision — offer only park + home.
const BASE_LOCATIONS: ExecutionLocation[] = ['home', 'park'];

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
      if (!label || label === 'ציוד לא מזוהה') return null; // i18n-allow-hebrew: data — compared with resolveEquipmentLabel's unknown-gear label
      return { id, label, icon: resolveEquipmentSvgPathList(id)[0] ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

interface WorkoutLocationSwitcherProps {
  currentLocation: ExecutionLocation;
  isSwapping: boolean;
  onSwap: (value: ExecutionLocation) => void;
  /** enable_location_gate_v1 — per-location verdict; a blocked location is shown greyed with a reason. */
  availability?: Record<string, LocationAvailability>;
  /** enable_location_gate_v1 — fired when the dropdown opens (the caller runs the availability dry-run). */
  onOpen?: (otherLocations: ExecutionLocation[]) => void;
  /** enable_location_gate_v1 — location whose swap was just refused: shows the inline notice. */
  blockedLocation?: ExecutionLocation | null;
  /** enable_location_gate_v1 — why it was refused (shown in plain words in the notice). */
  blockedReason?: string | null;
}

export default function WorkoutLocationSwitcher({
  currentLocation,
  isSwapping,
  onSwap,
  availability,
  onOpen,
  blockedLocation,
  blockedReason,
}: WorkoutLocationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const t = useT(library);

  // Persona gate: the 'service' (military) variant is offered only to the military persona.
  const profile = useUserStore((s) => s.profile);
  const isMilitary = profile ? hasPersona(profile, 'military') : false;
  const LOCATIONS: ExecutionLocation[] = isMilitary ? [...BASE_LOCATIONS, 'service'] : BASE_LOCATIONS;

  const options: LocationSwitcherOption[] = LOCATIONS.map((loc) => ({
    key: loc,
    location: loc,
    gear: gearChips(loc),
    isActive: loc === currentLocation,
    ...(availability?.[loc] && !availability[loc].allowed
      ? {
          disabled: true,
          disabledReason: t('preview.location.unavailable.reason', { reason: availability[loc].reason ?? 'notEnoughContent' }),
        }
      : {}),
  }));

  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">{t('preview.location.title')}</span>
      <LocationVariantSwitcher
        activeLocation={currentLocation}
        options={options}
        open={open}
        canSwitch={!isSwapping}
        onToggleOpen={() => {
          if (!open) onOpen?.(LOCATIONS.filter((l) => l !== currentLocation));
          setOpen((o) => !o);
        }}
        onClose={() => setOpen(false)}
        onSelect={(opt) => {
          setOpen(false);
          if (opt.location !== currentLocation) onSwap(opt.location as ExecutionLocation);
        }}
      />
      {isSwapping && <span className="text-xs text-cyan-600 animate-pulse">{t('preview.location.swapping')}</span>}
      {!isSwapping && blockedLocation && (
        <span className="text-xs text-amber-600" role="status">
          {t('preview.location.unavailable.explained', { location: blockedLocation, reason: blockedReason ?? 'notEnoughContent' })}
        </span>
      )}
    </div>
  );
}
