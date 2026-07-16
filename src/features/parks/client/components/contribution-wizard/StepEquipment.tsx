'use client';

/**
 * StepEquipment — optional wizard step (gym_park only) that lets the user tag
 * the specific equipment installed at the location, "like the park page".
 *
 * Reuses the shared EquipmentCard (rightSlot="check") and the gym_equipment
 * catalog, filtered to park-installed items. The user never picks a brand —
 * each selection is stored as { equipmentId, brandName: '' }; the brand is
 * resolved by the admin / fallback on approval.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Search } from 'lucide-react';
import type { WizardData } from './index';
import EquipmentCard from '../equipment-detail/EquipmentCard';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

interface Props {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepEquipment({ data, updateData, onNext, onBack }: Props) {
  const [catalog, setCatalog] = useState<GymEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Load the gym_equipment catalog once; keep only park-installed items — the
  // only ones meaningful when tagging a park (98% of the catalog is tagged).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllGymEquipment();
        if (!cancelled) setCatalog(all.filter((e) => e.availableInLocations?.includes('park')));
      } catch (err) {
        console.error('[StepEquipment] Failed to load gym_equipment:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedIds = useMemo(
    () => new Set((data.gymEquipment ?? []).map((g) => g.equipmentId)),
    [data.gymEquipment],
  );

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // brandName stays '' — user never picks a brand (resolved on approval).
    updateData({ gymEquipment: [...next].map((equipmentId) => ({ equipmentId, brandName: '' })) });
  };

  const term = search.trim().toLowerCase();
  const visible = term ? catalog.filter((e) => e.name.toLowerCase().includes(term)) : catalog;
  const count = selectedIds.size;

  return (
    <div className="flex flex-col h-full px-4 pb-6 overflow-y-auto">
      {/* Header + search */}
      <div className="mb-3">
        <label className="text-slate-500 text-xs font-bold mb-2 block">
          אילו מתקנים יש במיקום?{count > 0 ? ` · נבחרו ${count}` : ''}
        </label>
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש מתקן..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 outline-none focus:border-[#00E5FF] transition-colors"
          />
        </div>
      </div>

      {/* Grid / states */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#00E5FF]" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">
            {catalog.length === 0 ? 'אין מתקני-פארק בקטלוג' : 'לא נמצאו מתקנים'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((eq) => (
              <EquipmentCard
                key={eq.id}
                equipment={eq}
                rightSlot="check"
                selected={selectedIds.has(eq.id)}
                onClick={() => toggle(eq.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Navigation — equipment is optional, so forward is always enabled. */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onBack}
          className="px-6 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-[0.98]"
        >
          חזרה
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-1 bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25"
        >
          {count > 0 ? 'המשך' : 'דלג'}
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}
