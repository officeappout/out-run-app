'use client';

/**
 * The park's equipment as dark tiles (enable_place_workouts_v1, board RP-13
 * phone 1): icon + name + brand, 2 columns, the first SHOWN_TILES and
 * "עוד N מתקנים ›" to show the rest. A tile opens the equipment drawer, as
 * the classic grid does.
 */

import { useState, type ReactNode } from 'react';
import { Dumbbell } from 'lucide-react';
import type { Park } from '@/features/parks/core/types/park.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export const SHOWN_TILES = 6;
const TILE_BG = 'linear-gradient(160deg, #0e1419, #24323d)';

export interface ParkEquipmentTilesProps {
  park: Park;
  equipment: readonly GymEquipment[];
  onSelect: (selection: { id: string; brand: string | null }) => void;
}

export default function ParkEquipmentTiles({ park, equipment, onSelect }: ParkEquipmentTilesProps) {
  const t = useT(map);
  const [all, setAll] = useState(false);
  if (equipment.length === 0) return null;
  const shown = all ? equipment : equipment.slice(0, SHOWN_TILES);
  const hidden = equipment.length - SHOWN_TILES;
  return (
    <section className="mb-6">
      <h3 className="mb-2.5 text-[17px] font-black text-v2-ink">
        {t.rich('parkDetail.equipment.title', {
          count: String(park.gymEquipment?.length ?? equipment.length),
          muted: (chunks: ReactNode) => <span className="font-medium text-v2-muted">{chunks}</span>,
        })}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {shown.map((eq) => {
          const brand = park.gymEquipment?.find((g) => g.equipmentId === eq.id)?.brandName || park.primaryBrand || '';
          return (
            <button
              key={eq.id}
              type="button"
              onClick={() => onSelect({ id: eq.id, brand: brand || null })}
              className="flex flex-col gap-2.5 rounded-[20px] p-3 text-start text-white transition-transform duration-150 ease-v2 active:scale-[0.98]"
              style={{ background: TILE_BG }}
              aria-label={eq.name}
            >
              <span className="grid h-[38px] w-[38px] place-items-center rounded-xl" style={{ background: 'rgba(0,186,247,0.16)' }}>
                {eq.iconKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/assets/icons/equipment/${eq.iconKey}.svg`} alt="" className="h-6 w-6 object-contain brightness-0 invert" loading="lazy" decoding="async" />
                ) : (
                  <Dumbbell size={20} className="text-v2-accent" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-black">{eq.name}</span>
                {brand && <span className="block truncate text-[11.5px] font-bold opacity-70">{brand}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2.5 w-full whitespace-nowrap py-1 text-center text-[13px] font-extrabold text-v2-deep"
          aria-expanded={all}
        >
          {all ? t('placeWorkouts.equipment.less') : t('placeWorkouts.equipment.more', { count: hidden })}
        </button>
      )}
    </section>
  );
}
