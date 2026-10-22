'use client';

import type { ReactNode } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import EquipmentCard from '../../equipment-detail/EquipmentCard';
import type { EquipmentSection } from '../utils/park-detail-logic';
import { sectionTitleClass } from './section-styles';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

interface ParkEquipmentSectionProps {
  park: Park;
  v2: boolean;
  sections: EquipmentSection[];
  onSelect: (selection: { id: string; brand: string | null }) => void;
}

/**
 * EQUIPMENT — fitness gear installed at the park, split into
 * אירובי/פונקציונלי/הידראולי (only non-empty sections render). Each tile
 * opens EquipmentDetailDrawer without leaving the park context, carrying the
 * park's brand so the drawer lands on the right brand variant.
 */
export default function ParkEquipmentSection({ park, v2, sections, onSelect }: ParkEquipmentSectionProps) {
  const t = useT(mapNs);
  return (
    <section className="mb-6">
      <h3 className={sectionTitleClass(v2)}>
        {t.rich('parkDetail.equipment.title', {
          count: String(park.gymEquipment?.length ?? 0),
          muted: (chunks: ReactNode) => <span className="text-gray-400 dark:text-gray-500 font-medium">{chunks}</span>,
        })}
      </h3>
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key}>
            <h4 className="text-[13px] font-bold text-gray-500 dark:text-gray-400 mb-2">
              {t('parkDetail.equipment.section', { section: section.key })}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {section.items.map((eq) => {
                const parkRef = park.gymEquipment?.find(
                  (g) => g.equipmentId === eq.id,
                );
                // Resolution: per-equipment override → park-level primaryBrand → ''
                const brandName = parkRef?.brandName || park.primaryBrand || '';
                return (
                  <EquipmentCard
                    key={eq.id}
                    equipment={eq}
                    brandName={brandName}
                    layout="tile"
                    onClick={() =>
                      onSelect({ id: eq.id, brand: brandName || null })
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
