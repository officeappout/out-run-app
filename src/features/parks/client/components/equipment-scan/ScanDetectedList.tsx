'use client';

/**
 * Park mapping, top of the existing equipment step (ScanMap board): what the photos found,
 * pre-selected, each with the real catalog photo, "זוהה" / "לא בטוח" and ✕ to remove it; then
 * "פספסנו משהו? חפשו והוסיפו" above the step's own search and grid.
 */
import { X } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import ScanEquipmentPill from './ScanEquipmentPill';

export interface ScanDetectedListProps {
  items: readonly GymEquipment[];
  unsure: readonly string[];
  /** How many the photos found (the line keeps the number after a removal). */
  found: number;
  onRemove: (equipmentId: string) => void;
}

export default function ScanDetectedList({ items, unsure, found, onRemove }: ScanDetectedListProps) {
  const t = useT(map);
  return (
    <div className="mb-3">
      {found > 0 && <p className="mb-2 text-[12.5px] font-bold text-v2-muted">{t('wizard.scan.equipment.found', { count: found })}</p>}
      <div className="flex max-h-[32vh] flex-col gap-2 overflow-y-auto px-0.5 py-0.5">
        {items.map((eq) => {
          const isUnsure = unsure.includes(eq.id);
          return (
            <ScanEquipmentPill
              key={eq.id}
              equipment={eq}
              name={eq.name}
              selected
              onClick={() => onRemove(eq.id)}
              tag={
                <span className={`flex-shrink-0 rounded-full px-2 text-[11px] font-black leading-[20px] ${isUnsure ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' : 'bg-white text-v2-deep ring-1 ring-inset ring-v2-accent/40'}`}>
                  {isUnsure ? t('wizard.scan.tag.unsure') : t('wizard.scan.tag.found')}
                </span>
              }
              trailing={<X size={16} strokeWidth={2.6} className="flex-shrink-0 text-v2-muted" aria-label={t('wizard.scan.equipment.remove')} />}
            />
          );
        })}
      </div>
      <p className="mt-3 text-[13px] font-extrabold text-v2-deep">{t('wizard.scan.equipment.missed')}</p>
    </div>
  );
}
