'use client';

/**
 * StepEquipment — optional wizard step (gym_park only) that lets the user tag
 * the specific equipment installed at the location, "like the park page".
 *
 * Reuses the shared EquipmentCard (rightSlot="check") and the gym_equipment
 * catalog, filtered to park-installed items. The user never picks a brand —
 * each selection is stored as { equipmentId, brandName: '' }; the brand is
 * resolved by the admin / fallback on approval.
 *
 * Layout (23.09.2026 field-test fixes): three fixed regions, not one
 * scrolling column — header (question + selected-names row + search) stays
 * visible, only the equipment grid scrolls, and the nav buttons stay pinned
 * at the bottom regardless of scroll position or grid length. Every sibling
 * step (Location, Photo) achieves "buttons stay put" by simply never having
 * scrollable content in the first place (mt-auto in a non-scrolling flex
 * column) — this is the one step whose content can genuinely overflow, so it
 * needs a real scroll region instead of that shortcut.
 *
 * Deliberately NOT copying PersonaQuestionsDrawer's onNeedsExpandedHeight
 * keyboard trick here — that mechanism's own doc comment says it exists for
 * short-content steps (one input, a short list) that don't reach the sheet's
 * max-height on their own; an equipment grid is explicitly the counter-
 * example given there. Restructuring so the search field lives in the fixed
 * header (never scrolls out of view) may already resolve the reported
 * "keyboard hides the field" complaint on its own — pending on-device
 * confirmation before adding more machinery for it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Names for the "selected" row — same catalog the grid already has, no
  // extra fetch. Preserves catalog order rather than selection order, which
  // is fine here (the row is for recognition, not a history of taps).
  const selectedNames = useMemo(
    () => catalog.filter((e) => selectedIds.has(e.id)).map((e) => e.name),
    [catalog, selectedIds],
  );

  const toggle = useCallback((id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // brandName stays '' — user never picks a brand (resolved on approval).
    // Array.from (not [...set]) to stay tsc-clean under the project's target.
    updateData({ gymEquipment: Array.from(next).map((equipmentId) => ({ equipmentId, brandName: '' })) });

    // Clear the search + close the keyboard so the next search starts clean
    // — otherwise the stale filter/open keyboard blocks the view of what was
    // just selected (field-test finding, 23.09.2026). Harmless no-op when
    // triggered from the unfiltered grid (search is already '').
    setSearch('');
    searchInputRef.current?.blur();
  }, [selectedIds, updateData]);

  const term = search.trim().toLowerCase();
  const visible = term ? catalog.filter((e) => e.name.toLowerCase().includes(term)) : catalog;

  return (
    <div className="flex flex-col h-full px-4 pb-6">
      {/* Fixed header — question, selected-names row, search. Never scrolls
          out of view regardless of how long the equipment grid gets. */}
      <div className="mb-3 flex-shrink-0">
        <label className="text-slate-500 text-xs font-bold mb-2 block">
          אילו מתקנים יש במיקום?
        </label>

        {selectedNames.length > 0 && (
          // Wraps to as many lines as needed rather than truncating — the
          // whole point of this row is that selections must stay visible,
          // not just countable. A wrapping list can grow the fixed header
          // when many items are selected, shrinking the grid's share of the
          // sheet — reasonable for now; revisit with a chip/"+N more" design
          // if on-device testing shows this getting unwieldy with a large
          // selection.
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            <span className="font-bold text-slate-600">נבחרו: </span>
            {selectedNames.join(', ')}
          </p>
        )}

        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש מתקן..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 outline-none focus:border-[#00E5FF] transition-colors"
          />
        </div>
      </div>

      {/* Scrollable middle — the grid only. */}
      <div className="flex-1 overflow-y-auto">
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

      {/* Fixed footer — equipment is optional, so forward is always enabled. */}
      <div className="flex gap-3 mt-4 flex-shrink-0">
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
          {selectedIds.size > 0 ? 'המשך' : 'דלג'}
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}
