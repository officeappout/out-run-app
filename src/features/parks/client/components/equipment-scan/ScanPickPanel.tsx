'use client';

/**
 * "בחירה מהרשימה" / "חיפוש בכל המתקנים": the park catalog as the add-park wizard's pills with a
 * search field (same filter and copy as StepEquipment), real photos first.
 */
import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { V2_INPUT } from '../contribution-wizard/wizard-v2';
import ScanEquipmentPill from './ScanEquipmentPill';

export interface ScanPickPanelProps {
  catalog: readonly GymEquipment[];
  loading: boolean;
  onPick: (equipmentId: string) => void;
}

export default function ScanPickPanel({ catalog, loading, onPick }: ScanPickPanelProps) {
  const t = useT(map);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const visible = term ? catalog.filter((e) => e.name.toLowerCase().includes(term)) : catalog;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <h2 className="text-[19px] font-black text-v2-ink">{t('scan.pick.title')}</h2>
      <div className="relative">
        <Search size={16} strokeWidth={2.4} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-v2-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('wizard.equipment.search')}
          aria-label={t('wizard.equipment.search')}
          className={`${V2_INPUT} !ps-10`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 pt-0.5">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-v2-accent" /></div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-[14px] font-bold text-v2-muted">
            {catalog.length === 0 ? t('wizard.equipment.emptyCatalog') : t('wizard.equipment.noMatch')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((eq) => <ScanEquipmentPill key={eq.id} equipment={eq} name={eq.name} onClick={() => onPick(eq.id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}
