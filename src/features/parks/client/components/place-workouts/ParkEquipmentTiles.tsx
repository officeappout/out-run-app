'use client';

/**
 * The park's equipment as dark tiles (enable_place_workouts_v1, board RP-13
 * phone 1): the equipment's picture + name + brand (ParkEquipmentTile), 2 columns, the first SHOWN_TILES and
 * "עוד N מתקנים ›" to show the rest. A tile opens the equipment drawer, as
 * the classic grid does.
 */

import { useState, type ReactNode } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import ParkEquipmentTile from './ParkEquipmentTile';

export const SHOWN_TILES = 6;

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
          return <ParkEquipmentTile key={eq.id} equipment={eq} brand={brand} onSelect={() => onSelect({ id: eq.id, brand: brand || null })} />;
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
