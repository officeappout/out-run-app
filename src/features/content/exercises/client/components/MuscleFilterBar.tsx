'use client';

/**
 * MuscleFilterBar — always-visible horizontal muscle-group bar (top of the
 * exercise library, above the results grid). Single-select: tapping a chip
 * replaces the current muscle selection; tapping the active chip again
 * clears it. Reuses the male muscle SVGs already shipped at
 * /public/icons/muscles/male/ — no new icon assets.
 *
 * Was MuscleGroupChips.tsx (multi-select, unused — FilterPills.tsx had an
 * inline duplicate that was actually wired up). Repurposed for the redesign
 * instead of adding a third copy of this list.
 *
 * Each bar chip maps to a SET of underlying MuscleGroup values (not a 1:1
 * enum match) because the data model has no single "ידיים"/generic-"רגליים"
 * tag — e.g. "ידיים" means biceps ∪ triceps ∪ forearms. Selecting a chip
 * writes that whole set to the store's existing `filters.muscles` (OR-matched
 * downstream in useExerciseLibraryFilters), so no filtering-logic changes
 * were needed — only this UI-layer grouping.
 */

import { useMemo } from 'react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import type { MuscleGroup } from '../../core/exercise.types';

interface MuscleBarChip {
  key: string;
  label: string;
  icon: string;
  groups: MuscleGroup[];
}

const MUSCLE_BAR_CHIPS: MuscleBarChip[] = [
  { key: 'chest', label: 'חזה', icon: '/icons/muscles/male/chest.svg', groups: ['chest'] },
  { key: 'back', label: 'גב', icon: '/icons/muscles/male/back.svg', groups: ['back', 'middle_back'] },
  { key: 'shoulders', label: 'כתפיים', icon: '/icons/muscles/male/shoulders.svg', groups: ['shoulders', 'rear_delt'] },
  { key: 'core', label: 'ליבה', icon: '/icons/muscles/male/abs.svg', groups: ['core', 'abs', 'obliques'] },
  { key: 'arms', label: 'ידיים', icon: '/icons/muscles/male/biceps.svg', groups: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'רגליים', icon: '/icons/muscles/male/quads.svg', groups: ['legs', 'quads', 'hamstrings', 'calves', 'glutes'] },
];

function sameMuscleSet(a: MuscleGroup[], b: MuscleGroup[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((m) => setA.has(m));
}

export default function MuscleFilterBar() {
  const selected = useExerciseLibraryStore((s) => s.filters.muscles);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const chips = useMemo(
    () =>
      MUSCLE_BAR_CHIPS.map((chip) => ({
        ...chip,
        isActive: sameMuscleSet(selected, chip.groups),
      })),
    [selected],
  );

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" dir="rtl">
      <div className="flex gap-2 pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setMuscles(chip.isActive ? [] : chip.groups)}
            className="flex flex-col items-center gap-1 flex-shrink-0 w-[58px]"
            aria-pressed={chip.isActive}
          >
            <div
              className={`w-[52px] h-[52px] rounded-2xl border flex items-center justify-center transition-all ${
                chip.isActive
                  ? 'bg-cyan-50 border-primary shadow-sm'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chip.icon}
                alt=""
                className="w-[30px] h-[30px] object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            </div>
            <span
              className={`text-[10px] font-semibold whitespace-nowrap ${
                chip.isActive ? 'text-primary' : 'text-gray-600'
              }`}
            >
              {chip.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
