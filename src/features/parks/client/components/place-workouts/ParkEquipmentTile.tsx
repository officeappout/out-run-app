'use client';

/**
 * One equipment tile of the park page (enable_place_workouts_v1): the
 * equipment's real picture (equipmentImageUrl — the drawer's own chain) on
 * top, fading into the dark tile, name + brand below. The equipment icon
 * shows only when there is truly no picture (or it fails to load).
 */

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { bunnyImg } from '@/lib/bunny-image';
import { equipmentImageUrl } from '../equipment-detail/equipment-media';

const TILE_BG = '#0e1419';
/** Tile width × 2 (retina) for Bunny's resize. */
const IMG_W = 360;

export interface ParkEquipmentTileProps {
  equipment: GymEquipment;
  brand: string;
  onSelect: () => void;
}

export default function ParkEquipmentTile({ equipment: eq, brand, onSelect }: ParkEquipmentTileProps) {
  const [failed, setFailed] = useState(false);
  const image = equipmentImageUrl(eq, brand || null);
  const showImage = !!image && !failed;
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
      <span className="min-w-0 px-3 pb-3 pt-1">
        <span className="block truncate text-[14px] font-black">{eq.name}</span>
        {brand && <span className="block truncate text-[11.5px] font-bold opacity-70">{brand}</span>}
      </span>
    </button>
  );
}
