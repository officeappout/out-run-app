'use client';

/**
 * ActiveFilterChipsRow — removable chips for the committed secondary
 * filters (מסלול+רמה combined, מיקום, each ציוד item), plus "נקה הכל".
 * Rendered below the muscle bar, only when at least one is active.
 */

import { X } from 'lucide-react';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import type { Program } from '@/features/content/programs/core/program.types';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';

interface Props {
  programs: Program[];
  gear: GearDefinition[];
}

export default function ActiveFilterChipsRow({ programs, gear }: Props) {
  const filters = useExerciseLibraryStore((s) => s.filters);
  const setProgressionFilter = useExerciseLibraryStore((s) => s.setProgressionFilter);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);

  const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];

  if (filters.programId) {
    const programName = programs.find((p) => p.id === filters.programId)?.name ?? 'מסלול';
    chips.push({
      id: 'program',
      label: filters.level != null ? `${programName} · רמה ${filters.level}` : programName,
      onRemove: () => setProgressionFilter(null, null),
    });
  }

  if (filters.location === 'home' || filters.location === 'park') {
    chips.push({
      id: 'location',
      label: filters.location === 'park' ? 'פארק' : 'בית',
      onRemove: () => setFilterLocation(null),
    });
  }

  for (const id of filters.equipmentIds) {
    const label = id === BODYWEIGHT_SENTINEL
      ? 'משקל גוף'
      : gear.find((g) => g.id === id)?.name?.he ?? gear.find((g) => g.id === id)?.name?.en ?? id;
    chips.push({
      id: `eq-${id}`,
      label,
      onRemove: () => setEquipmentIds(filters.equipmentIds.filter((eqId) => eqId !== id)),
    });
  }

  if (chips.length === 0) return null;

  function clearAll() {
    setProgressionFilter(null, null);
    setFilterLocation(null);
    setEquipmentIds([]);
  }

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" dir="rtl">
      <div className="flex items-center gap-1.5 pb-1">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="flex-shrink-0 flex items-center gap-1.5 bg-cyan-50 border border-cyan-100 text-cyan-800 text-[11px] font-bold rounded-full ps-3 pe-2 py-1.5 whitespace-nowrap"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`הסר ${chip.label}`}
              className="text-cyan-500 hover:text-cyan-700"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={clearAll}
          className="flex-shrink-0 text-[11px] font-bold text-gray-500 px-1.5 py-1.5 whitespace-nowrap"
        >
          נקה הכל
        </button>
      </div>
    </div>
  );
}
