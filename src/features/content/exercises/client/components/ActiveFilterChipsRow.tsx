'use client';

/**
 * ActiveFilterChipsRow — removable chips for every active filter (muscle,
 * each track, each track's selected levels, מיקום, each ציוד item), plus
 * "נקה הכל". Rendered below the muscle bar, only when at least one is
 * active.
 *
 * Track and level chips are separate (round 5, #6 — level is per-track now,
 * levelsByProgram: Record<programId, number[]>): one chip per selected
 * track (removing it clears that whole track, levels included), and one
 * chip per selected level WITHIN a track, labeled "Track · רמה N" since two
 * different tracks can each have their own level 3 selected at once and a
 * bare "רמה 3" would be ambiguous about which track it belongs to.
 */

import { X } from 'lucide-react';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import { findActiveMuscleChips, toggleMuscleChip } from '../utils/muscle-bar.utils';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';

interface Props {
  gear: GearDefinition[];
}

export default function ActiveFilterChipsRow({ gear }: Props) {
  const filters = useExerciseLibraryStore((s) => s.filters);
  const programs = useExerciseLibraryStore((s) => s.allPrograms);
  const setLevelsByProgram = useExerciseLibraryStore((s) => s.setLevelsByProgram);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];

  for (const muscleChip of findActiveMuscleChips(filters.muscles)) {
    chips.push({
      id: `muscle-${muscleChip.key}`,
      label: muscleChip.label,
      onRemove: () => setMuscles(toggleMuscleChip(filters.muscles, muscleChip)),
    });
  }

  for (const [programId, levels] of Object.entries(filters.levelsByProgram)) {
    const programName = programs.find((p) => p.id === programId)?.name ?? 'מסלול';

    chips.push({
      id: `track-${programId}`,
      label: programName,
      onRemove: () => {
        const next = { ...filters.levelsByProgram };
        delete next[programId];
        setLevelsByProgram(next);
      },
    });

    for (const level of levels) {
      chips.push({
        id: `track-${programId}-level-${level}`,
        label: `${programName} · רמה ${level}`,
        onRemove: () => {
          setLevelsByProgram({
            ...filters.levelsByProgram,
            [programId]: filters.levelsByProgram[programId].filter((l) => l !== level),
          });
        },
      });
    }
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
    setMuscles([]);
    setLevelsByProgram({});
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
