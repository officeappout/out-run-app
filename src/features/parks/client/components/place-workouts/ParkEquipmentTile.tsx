'use client';

/**
 * One equipment tile of the park page (enable_place_workouts_v1): the
 * equipment's real picture (equipmentImageUrl — the drawer's own chain) on
 * top, fading into the dark tile, then the primary-muscle icon + name (the
 * classic EquipmentCard tile's muscle icon). No brand line (owner 26.10) —
 * the brand still picks the picture. The equipment icon shows only when
 * there is truly no picture (or it fails to load).
 */

import { useLocalizedGymEquipment } from '@/features/content/equipment/gym/core/useLocalizedGymEquipment';
import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { bunnyImg } from '@/lib/bunny-image';
import { MUSCLE_FALLBACK_ICON, MUSCLE_ICON_PATHS } from '@/lib/muscle-icons.const';
import { equipmentImageUrl } from '../equipment-detail/equipment-media';

const TILE_BG = '#0e1419';
/** Tile width × 2 (retina) for Bunny's resize. */
const IMG_W = 360;

export interface ParkEquipmentTileProps {
  equipment: GymEquipment;
  /** The park's installed brand: picks the picture only (not shown). */
  brand: string;
  onSelect: () => void;
}

export default function ParkEquipmentTile({ equipment: rawEq, brand, onSelect }: ParkEquipmentTileProps) {
  const eq = useLocalizedGymEquipment(rawEq);
  const [failed, setFailed] = useState(false);
  const image = equipmentImageUrl(eq, brand || null);
  const showImage = !!image && !failed;
  // Same primary-muscle resolution as EquipmentCard / the equipment drawer.
  const muscle = eq.primaryMuscle ?? eq.muscleGroups?.[0];
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-[20px] text-start text-white shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98]"
      style={{ background: TILE_BG }}
      aria-label={eq.name}
    >
      <span className="relative block h-[104px] w-full overflow-hidden bg-white/5">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bunnyImg(image, IMG_W)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            {eq.iconKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/assets/icons/equipment/${eq.iconKey}.svg`} alt="" className="h-10 w-10 object-contain brightness-0 invert opacity-80" loading="lazy" decoding="async" />
            ) : (
              <Dumbbell size={28} className="text-v2-accent" aria-hidden />
            )}
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: `linear-gradient(to bottom, transparent, ${TILE_BG})` }} />
      </span>
      <span className="flex min-w-0 items-center gap-2 px-3 pb-3 pt-1">
        {muscle && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/90 p-0.5" data-muscle-icon>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MUSCLE_ICON_PATHS[muscle] ?? MUSCLE_FALLBACK_ICON}
              alt=""
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
            />
          </span>
        )}
        <span className="min-w-0 truncate text-[14px] font-black">{eq.name}</span>
      </span>
    </button>
  );
}
