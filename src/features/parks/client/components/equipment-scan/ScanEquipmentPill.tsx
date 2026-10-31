'use client';

/**
 * One equipment pill in the scan screens: the add-park wizard's pill (v2Chip + EquipmentPillIcon),
 * with the real catalog photo first and an optional tag ("זוהה" / "לא בטוח") and trailing slot.
 */
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { EquipmentPillIcon } from '../contribution-wizard/EquipmentPillIcon';
import { v2Chip } from '../contribution-wizard/wizard-v2';

export interface ScanEquipmentPillProps {
  equipment: GymEquipment;
  name: string;
  selected?: boolean;
  tag?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}

export default function ScanEquipmentPill({ equipment, name, selected = false, tag, trailing, onClick }: ScanEquipmentPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      title={name}
      className={`flex h-12 w-full min-w-0 items-center gap-2 rounded-full ps-1.5 pe-3 text-start text-[13.5px] font-extrabold ${v2Chip(selected)}`}
    >
      <span className={`grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-full ${selected ? 'bg-white' : 'bg-v2-surface'}`}>
        <EquipmentPillIcon equipment={equipment} selected={selected} preferPhoto />
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">{name}</span>
      {tag}
      {selected && !trailing && <Check size={15} strokeWidth={3} className="flex-shrink-0 text-v2-deep" />}
      {trailing}
    </button>
  );
}
